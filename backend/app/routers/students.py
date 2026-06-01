import csv
import codecs

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Body
from sqlalchemy import select, delete
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Role, Student, User
from ..schemas import DeviceOut, StudentCreate, StudentOut, StudentUpdate
from ..security import get_current_user, require_roles, hash_password


router = APIRouter(prefix="/api/students", tags=["students"])


def _to_out(s: Student) -> StudentOut:
    parent_email = s.parent.email if (hasattr(s, 'parent') and s.parent) else None
    return StudentOut(
        id=s.id,
        full_name=s.full_name,
        class_name=s.class_name,
        school_id=s.school_id,
        parent_id=s.parent_id,
        parent_email=parent_email,
        device=DeviceOut.model_validate(s.device) if s.device else None,
    )


@router.get("", response_model=list[StudentOut])
def list_students(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    q = select(Student).options(selectinload(Student.device), selectinload(Student.parent))
    
    if user.role == Role.PARENT.value:
        q = q.where(Student.parent_id == user.id)
    elif user.role == Role.SCHOOL.value:
        if user.school_id is None:
            return []
        q = q.where(Student.school_id == user.school_id)
    else:
        pass
        
    students = db.execute(q).scalars().all()
    return [_to_out(s) for s in students]

@router.post("", response_model=StudentOut, status_code=201)
def create_student(
    payload: StudentCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    if payload.parent_id is not None:
        parent = db.get(User, payload.parent_id)
        if not parent or parent.role != Role.PARENT.value:
            raise HTTPException(status_code=400, detail="parent_id должен указывать на родителя")
    student = Student(
        full_name=payload.full_name,
        class_name=payload.class_name,
        parent_id=payload.parent_id,
        school_id=user.school_id
    )

    if user.role == Role.ADMIN.value and hasattr(payload, 'school_id'):
        student.school_id = payload.school_id

    db.add(student)
    db.commit()
    db.refresh(student)
    return _to_out(student)

@router.post("/import-csv", status_code=200)
def import_students_csv(
    file: UploadFile = File(...),
    school_id: int | None = None,
    db: Annotated[Session, Depends(get_db)] = None,
    user: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))] = None,
):
    target_school_id = user.school_id if user.role == Role.SCHOOL.value else school_id

    if not target_school_id:
        raise HTTPException(
            status_code=400, 
            detail="Необходимо указать ID школы для импорта (выберите школу в списке)"
        )
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Файл должен иметь расширение .csv"
        )
    
    try:
        text_stream = codecs.iterdecode(file.file, 'utf-8-sig')
        csv_reader = csv.DictReader(text_stream)
        
        required_columns = {"full_name", "class_name", "parent_email"}
        if not csv_reader.fieldnames or not required_columns.issubset(set(csv_reader.fieldnames)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Неверная структура заголовков CSV. Обязательные поля: {', '.join(required_columns)}"
            )
            
        students_to_add = []
        errors = []
        row_idx = 1
        temp_parents_cache = {}
        
        # Дефолтный пароль для автоматически создаваемых родителей
        DEFAULT_PARENT_PASSWORD = hash_password("Mektep12345")
        
        for row in csv_reader:
            row_idx += 1
            
            full_name = row.get("full_name", "").strip()
            class_name = row.get("class_name", "").strip()
            parent_email = row.get("parent_email", "").strip().lower()
            
            if not full_name or not class_name:
                errors.append(f"Строка {row_idx}: Пропущено ФИО ученика или класс.")
                continue
                
            parent_id = None
            if parent_email:
                if parent_email in temp_parents_cache:
                    parent_id = temp_parents_cache[parent_email]
                else:
                    parent_user = db.execute(
                        select(User).where(User.email == parent_email)
                    ).scalar_one_or_none()
                    
                    if parent_user:
                        if parent_user.role != Role.PARENT.value:
                            errors.append(f"Строка {row_idx}: Email '{parent_email}' занят сотрудником.")
                            continue
                        parent_id = parent_user.id
                        temp_parents_cache[parent_email] = parent_id
                    else:
                        try:
                            new_parent = User(
                                email=parent_email,
                                password_hash=DEFAULT_PARENT_PASSWORD,
                                full_name=f"Родитель ({full_name})",
                                role=Role.PARENT.value,
                                school_id=None
                            )
                            db.add(new_parent)
                            db.flush()
                            parent_id = new_parent.id
                            temp_parents_cache[parent_email] = parent_id
                        except Exception as e:
                            db.rollback()
                            errors.append(f"Строка {row_idx}: Ошибка БД при создании родителя.")
                            continue
                
            new_student = Student(
                full_name=full_name,
                class_name=class_name,
                parent_id=parent_id,
                school_id=target_school_id
            )
            students_to_add.append(new_student)
            
        if errors:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"message": "Ошибки в заполнении CSV файла", "errors": errors}
            )
            
        if students_to_add:
            db.add_all(students_to_add)
            db.commit()
            
        return {
            "status": "success",
            "message": f"Успешно добавлено учеников: {len(students_to_add)}"
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Критическая ошибка при чтении CSV: {str(e)}"
        )

@router.patch("/{student_id}", response_model=StudentOut)
def patch_student(
    student_id: int,
    payload: StudentUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    if user.role == Role.SCHOOL.value and student.school_id != user.school_id:
        raise HTTPException(status_code=403, detail="Нет доступа к этому ученику")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(student, key, value)

    db.commit()
    db.refresh(student)
    return _to_out(student)

@router.post("/bulk-delete", status_code=status.HTTP_200_OK)
def bulk_delete_students(
    payload: list[int],
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Список ID для удаления пуст"
        )
        
    statement = delete(Student).where(Student.id.in_(payload))
    result = db.execute(statement)
    db.commit()
    
    return {
        "status": "success",
        "message": f"Успешно удалено учеников: {result.rowcount}"
    }

@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_student(
    student_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Ученик с ID {student_id} не найден"
        )
    
    db.delete(student)
    db.commit()
    return None
