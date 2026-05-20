from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.config import settings
from app.api.endpoints import router as api_router
from app.workers.cleanup_manager import CleanupManager
from app.workers.job_manager import JobManager
from app.utils.logger import get_logger

logger = get_logger("main")

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Automated AI Landscape to Vertical 9:16 Video Clipping Platform MVP",
    version="1.0.0"
)

# Set CORS permissions
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Standard development permissions
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure clips directory exists
os.makedirs(settings.CLIP_DIR, exist_ok=True)

# Mount clips folder statically to make them accessible via URL (e.g. http://localhost:8000/clips/xxx.mp4)
app.mount("/clips", StaticFiles(directory=settings.CLIP_DIR), name="clips")
app.mount("/merged", StaticFiles(directory=settings.MERGED_DIR), name="merged")

# Include central routing
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.on_event("startup")
async def startup_event():
    """
    Kicks off our custom async Background Worker listener on server startup.
    """
    logger.info("Initializing application startup sequence...")
    JobManager.start_worker()
    CleanupManager.start_cleanup()
    logger.info("Ready for clipping jobs and cleanup monitoring!")

@app.on_event("shutdown")
async def shutdown_event():
    """Gracefully stop the cleanup task on server shutdown."""
    logger.info("Shutting down cleanup service...")
    await CleanupManager.stop_cleanup()

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "docs_url": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    # Start ASGI server using config variables
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=True)
