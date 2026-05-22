import csv
import codecs

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Role, Student, User
from ..schemas import DeviceOut, StudentCreate, StudentOut
from ..security import get_current_user, require_roles


router = APIRouter(prefix="/api/students", tags=["students"])


def _to_out(s: Student) -> StudentOut:
    parent_email = s.parent.email if (hasattr(s, 'parent') and s.parent) else None
    return StudentOut(
        id=s.id,
        full_name=s.full_name,
        class_name=s.class_name,
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
    students = db.execute(q).scalars().all()
    return [_to_out(s) for s in students]


@router.post("", response_model=StudentOut, status_code=201)
def create_student(
    payload: StudentCreate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    if payload.parent_id is not None:
        parent = db.get(User, payload.parent_id)
        if not parent or parent.role != Role.PARENT.value:
            raise HTTPException(status_code=400, detail="parent_id должен указывать на родителя")
    student = Student(
        full_name=payload.full_name,
        class_name=payload.class_name,
        parent_id=payload.parent_id,
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return _to_out(student)

@router.post("/import-csv", status_code=200)
def import_students_csv(
    file: UploadFile = File(...),
    db: Annotated[Session, Depends(get_db)] = None,
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))] = None,
):
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
        
        for row in csv_reader:
            row_idx += 1
            
            full_name = row.get("full_name", "").strip()
            class_name = row.get("class_name", "").strip()
            parent_email = row.get("parent_email", "").strip()
            
            if not full_name or not class_name:
                errors.append(f"Строка {row_idx}: Пропущено ФИО ученика или класс.")
                continue
                
            parent_id = None
            if parent_email:
                parent_user = db.execute(
                    select(User).where(User.email == parent_email)
                ).scalar_one_or_none()
                
                if not parent_user:
                    errors.append(f"Строка {row_idx}: Родитель с email '{parent_email}' не зарегистрирован в системе.")
                    continue
                if parent_user.role != Role.PARENT.value:
                    errors.append(f"Строка {row_idx}: Пользователь '{parent_email}' найден, но он не является родителем.")
                    continue
                
                parent_id = parent_user.id
                
            new_student = Student(
                full_name=full_name,
                class_name=class_name,
                parent_id=parent_id
            )
            students_to_add.append(new_student)
            
        if errors:
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

@router.delete("/bulk-delete", status_code=status.HTTP_200_OK)
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
        
    from sqlalchemy import delete
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
