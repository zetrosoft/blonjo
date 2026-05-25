import os
import secrets
import logging
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List

logger = logging.getLogger("sajen.config")

class Settings(BaseSettings):
    PROJECT_NAME: str = "Sajen Core API"
    VERSION: str = "1.3.0"
    API_V1_STR: str = "/api/v1"
    
    # CORS Origins (comma-separated string in env will parse as list)
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:7500",
        "http://127.0.0.1:7500",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ]
    
    # JWT Auth
    SECRET_KEY: str = "yolo_super_secret_key_change_in_production_12345"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days
    
    # Database
    DATABASE_URL: str = "postgresql://sajen_user:secret@localhost:5432/blonjo_db"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Ollama Model Config
    OLLAMA_LLM_MODEL: str = "qwen2.5:3b"

    @field_validator("SECRET_KEY", mode="after")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        # Jika nilai default masih digunakan di lingkungan non-development
        # kita hasilkan key acak yang aman demi keamanan default (secure by default)
        if v == "yolo_super_secret_key_change_in_production_12345":
            env = os.getenv("ENV", "development")
            if env == "production":
                raise ValueError("SECRET_KEY wajib diubah di lingkungan production demi keamanan data keuangan!")
            
            secure_key = secrets.token_hex(32)
            logger.warning(
                "PERINGATAN KEAMANAN: Menggunakan SECRET_KEY default yang lemah! "
                "Secara otomatis beralih ke kunci acak untuk sesi ini demi keamanan."
            )
            return secure_key
        return v

    model_config = SettingsConfigDict(env_file=".env", env_ignore_empty=True, extra="ignore")

settings = Settings()

