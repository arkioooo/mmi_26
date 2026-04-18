import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PORT         = int(os.getenv("PORT", 8000))
    POSTGRES_URL = os.getenv("POSTGRES_URL")
    REDIS_HOST   = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT   = int(os.getenv("REDIS_PORT", 6379))
    OLLAMA_URL   = os.getenv("OLLAMA_URL", "http://localhost:11434")
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")

    def validate(self):
        if not self.POSTGRES_URL:
            raise ValueError("POSTGRES_URL is not set in .env")

settings = Settings()
settings.validate()