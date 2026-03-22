from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "My Budget+ API"
    DEBUG: bool = True

    # PostgreSQL
    DATABASE_URL: str = "postgresql://mybudget:mybudget@localhost:5433/mybudget"

    # Azure SQL Server (read-only)
    AZURE_SQL_HOST: str = "gx-zsesqlp011.database.windows.net"
    AZURE_SQL_DB: str = "REPORT_COMMON"
    AZURE_SQL_USER: str = "KRAzureCommon"
    AZURE_SQL_PASSWORD: str = ""

    # Auth
    SECRET_KEY: str = "mybudget-secret-key-change-in-production"

    # CORS
    FRONTEND_URL: str = "http://localhost:8001"

    class Config:
        env_file = ".env"


settings = Settings()
