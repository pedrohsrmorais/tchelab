# config.py

from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    redis_host:    str = "localhost"
    redis_port:    int = 6379
    redis_password: str | None = None

    mysql_host:    str = "localhost"
    mysql_port:    int = 3306
    mysql_user:    str
    mysql_password: str
    mysql_db:      str = "tchelab"

    node_api_url:  str = "http://localhost:3003/api"
    worker_secret: str  # mesmo valor do .env do Node

    models_path:   str = "./saved_models"

    class Config:
        env_file = ".env"

settings = Settings()