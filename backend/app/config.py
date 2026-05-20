import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # App Information
    PROJECT_NAME: str = "AI Vertical Video Clip Generator"
    API_V1_STR: str = "/api"
    
    # Port & Host
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Paths
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DOWNLOAD_DIR: str = os.path.join(BASE_DIR, "downloads")
    CLIP_DIR: str = os.path.join(BASE_DIR, "clips")
    TEMP_DIR: str = os.path.join(BASE_DIR, "temp")
    MERGED_DIR: str = os.path.join(BASE_DIR, "merged")
    DB_PATH: str = os.path.join(BASE_DIR, "jobs.db")

    # FFmpeg Settings
    # If set to True, will use NVIDIA GPU acceleration (NVENC) for fast video encoding.
    # Auto-detected if nvidia-smi is available, but can be forced.
    USE_GPU: bool = False

    # Cleanup settings
    VIDEO_EXPIRY_HOURS: int = 4
    CLEANUP_INTERVAL_MINUTES: int = 10
    
    # yt-dlp Configuration
    MAX_VIDEO_SIZE_MB: int = 500  # Safety threshold for downloads
    
    class Config:
        case_sensitive = True

settings = Settings()

# Ensure directories exist
os.makedirs(settings.DOWNLOAD_DIR, exist_ok=True)
os.makedirs(settings.CLIP_DIR, exist_ok=True)
os.makedirs(settings.TEMP_DIR, exist_ok=True)
os.makedirs(settings.MERGED_DIR, exist_ok=True)
