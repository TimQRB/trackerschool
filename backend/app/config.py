from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://safemektep:safemektep@db:5432/safemektep"
    redis_url: str = "redis://redis:6379/0"
    jwt_secret: str = "change-me-in-prod"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7
    admin_email: str = "admin@safemektep.kz"
    admin_password: str = "admin123"


settings = Settings()
