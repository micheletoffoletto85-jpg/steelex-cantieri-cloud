from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str = "cambia-questa-chiave-in-produzione"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 giorni
    UPLOAD_DIR: str = "/tmp/uploads"
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    CORS_ORIGINS: str = "*"
    # Cloudflare R2
    R2_ACCOUNT_ID: Optional[str] = None
    R2_ACCESS_KEY_ID: Optional[str] = None
    R2_SECRET_ACCESS_KEY: Optional[str] = None
    R2_BUCKET_NAME: str = "steelex-cantieri"
    R2_PUBLIC_URL: Optional[str] = None  # es. https://pub-xxx.r2.dev

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
