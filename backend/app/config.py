from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import Optional

_DEFAULT_SECRET = "cambia-questa-chiave-in-produzione"

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str = _DEFAULT_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60          # 1 ora
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30            # refresh token 30 giorni
    UPLOAD_DIR: str = "/tmp/uploads"
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    CORS_ORIGINS: str = "*"

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_key_non_default(cls, v: str) -> str:
        if v == _DEFAULT_SECRET:
            import secrets, sys
            gen = secrets.token_hex(32)
            print(
                f"\n[SICUREZZA] SECRET_KEY non impostata. Genera una chiave sicura e aggiungila al .env:\n"
                f"  SECRET_KEY={gen}\n",
                file=sys.stderr,
            )
            # In produzione blocca il boot; in sviluppo usa la chiave generata temporaneamente
            import os
            if os.getenv("ENVIRONMENT", "development").lower() == "production":
                raise ValueError("SECRET_KEY deve essere impostata nel .env in produzione")
            return gen
        return v
    # Web Push VAPID
    VAPID_PRIVATE_KEY: Optional[str] = None
    VAPID_PUBLIC_KEY: Optional[str] = None
    VAPID_EMAIL: str = "mailto:admin@steelex.it"
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
