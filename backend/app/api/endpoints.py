from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl
from typing import List, Dict, Any, Optional
from app.services.downloader import DownloaderService
from app.workers.job_manager import JobManager
from app.models.jobs import JobModel
from app.utils.logger import get_logger

logger = get_logger("api_endpoints")
router = APIRouter()

class AnalyzeRequest(BaseModel):
    youtube_url: str

class GenerateRequest(BaseModel):
    youtube_url: str
    selected_duration: int  # 10, 20, 30, 40 seconds

@router.post("/analyze")
async def analyze_video(request: AnalyzeRequest):
    """
    Examines a YouTube URL and extracts metadata (title, thumbnail, duration) without downloading the file.
    """
    logger.info(f"Received metadata request for: {request.youtube_url}")
    result = DownloaderService.fetch_video_metadata(request.youtube_url)
    
    if not result["success"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid YouTube URL or access restricted. Details: {result.get('error')}"
        )
        
    return {
        "title": result["title"],
        "thumbnail": result["thumbnail"],
        "duration": result["duration"],
        "formatted_duration": f"{int(result['duration'] // 60)}m {int(result['duration'] % 60)}s"
    }

@router.post("/generate-clips")
async def generate_clips(request: GenerateRequest):
    """
    Queues a background job to download, analyze, scale and pad, and split a video into 9:16 vertical segments.
    """
    if request.selected_duration <= 0:
        raise HTTPException(
            status_code=400,
            detail="Clip duration must be a positive integer."
        )
        
    logger.info(f"Queuing clip generation for URL: {request.youtube_url} (Clip size: {request.selected_duration}s)")
    
    try:
        # Submit the job to our async Background Task queue
        job_id = await JobManager.submit_job(request.youtube_url, request.selected_duration)
        return {
            "success": True,
            "job_id": job_id,
            "message": "Clip generation job successfully queued."
        }
    except Exception as e:
        logger.error(f"Error submitting generation job: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to submit clipping job: {str(e)}")

@router.get("/status/{job_id}")
async def get_job_status(job_id: str):
    """
    Queries the current progress, state, and generated clips of a queued background job.
    """
    job = JobModel.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
        
    return {
        "id": job["id"],
        "job_id": job["id"],
        "youtube_url": job["youtube_url"],
        "title": job["title"],
        "thumbnail": job["thumbnail"],
        "duration": job["duration"],
        "selected_duration": job["selected_duration"],
        "status": job["status"],
        "progress": job["progress"],
        "error": job["error"],
        "clips": job["clips"]
    }

@router.get("/clips")
async def get_all_clips():
    """
    Fetches all historical clipping jobs and their associated clips.
    """
    try:
        jobs = JobModel.get_all_jobs()
        return {
            "success": True,
            "jobs": jobs
        }
    except Exception as e:
        logger.error(f"Error retrieving jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

import os
import uuid
from app.config import settings
from app.ffmpeg.processor import VideoProcessor
from app.services.analyzer import AnalyzerService

class MergeRequest(BaseModel):
    clips: List[str]
    final_duration: Optional[float] = None

@router.post("/merge-clips")
async def merge_clips(request: MergeRequest):
    """
    Merges selected clips into a final 1-minute video.
    Trims the final clip if total duration exceeds 60 seconds.
    """
    if not request.clips:
        raise HTTPException(status_code=400, detail="No clips provided for merging.")
        
    clip_paths = []
    total_duration = 0.0
    valid_clips = []

    # Collect durations for all selected clips and validate existence
    clip_infos = []  # list of dicts: {name, path, duration}
    for clip_name in request.clips:
        clip_path = os.path.join(settings.CLIP_DIR, clip_name)
        if not os.path.exists(clip_path):
            raise HTTPException(status_code=404, detail=f"Clip not found: {clip_name}")

        try:
            analysis = AnalyzerService.analyze_video(clip_path)
            clip_dur = float(analysis["duration"])
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to analyze {clip_name}: {e}")

        clip_infos.append({"name": clip_name, "path": clip_path, "duration": clip_dur})
        total_duration += clip_dur

    # Validate final_duration parameter
    target = None
    if request.final_duration is not None:
        try:
            target = float(request.final_duration)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid final_duration value")

    # If a target duration is supplied, enforce trimming rules
    if target is not None:
        # Edge case: selected clips total less than requested
        if total_duration < target - 1e-3:
            raise HTTPException(status_code=400, detail="Selected clips total duration is less than requested final duration")

        # If equal (within epsilon), proceed to merge without trimming
        if abs(total_duration - target) < 1e-3:
            clip_paths = [ci["path"] for ci in clip_infos]
        else:
            # Need to trim only middle clips (never trim first or last)
            n = len(clip_infos)
            if n <= 2:
                raise HTTPException(status_code=400, detail="Cannot trim to requested duration while preserving first and last clips with fewer than 3 clips.")

            excess = total_duration - target

            # Gather middle clips
            middle_indices = list(range(1, n - 1))
            middle_total = sum(clip_infos[i]["duration"] for i in middle_indices)

            if middle_total < excess - 1e-6:
                raise HTTPException(status_code=400, detail="Not enough middle-clip duration to trim to requested final duration while preserving first and last clips.")

            # Compute proportional reduction across middle clips
            ratio = (middle_total - excess) / middle_total
            new_middle_durations = []
            for i in middle_indices:
                orig = clip_infos[i]["duration"]
                new_d = orig * ratio
                new_middle_durations.append(new_d)

            # Correct rounding error by adjusting last middle clip
            sum_new_middle = sum(new_middle_durations)
            rounding_diff = (middle_total - excess) - sum_new_middle
            if abs(rounding_diff) > 1e-6 and new_middle_durations:
                new_middle_durations[-1] += rounding_diff

            # Build final clip_paths: first unchanged, middle trimmed, last unchanged
            clip_paths.append(clip_infos[0]["path"])  # first
            for idx, i in enumerate(middle_indices):
                orig_path = clip_infos[i]["path"]
                new_dur = new_middle_durations[idx]
                trimmed_name = f"trimmed_{uuid.uuid4().hex[:8]}_{clip_infos[i]['name']}"
                trimmed_path = os.path.join(settings.TEMP_DIR, trimmed_name)
                success = VideoProcessor.trim_clip(orig_path, trimmed_path, new_dur)
                if not success:
                    raise HTTPException(status_code=500, detail=f"Failed to trim {clip_infos[i]['name']}")
                clip_paths.append(trimmed_path)
                valid_clips.append(trimmed_path)

            clip_paths.append(clip_infos[-1]["path"])  # last
    else:
        # No target supplied; merge as-is
        clip_paths = [ci["path"] for ci in clip_infos]
            
    if not clip_paths:
        raise HTTPException(status_code=400, detail="No valid clips to merge.")
        
    final_filename = f"final_video_{uuid.uuid4().hex[:8]}.mp4"
    final_path = os.path.join(settings.MERGED_DIR, final_filename)
    
    success = VideoProcessor.merge_clips(clip_paths, final_path, settings.USE_GPU)
    
    # Cleanup trimmed temp files
    for cp in valid_clips:
        if os.path.exists(cp) and settings.TEMP_DIR in cp:
            os.remove(cp)
            
    if not success or not os.path.exists(final_path):
        logger.error("Failed to merge clips for merge request.")
        raise HTTPException(status_code=500, detail="Failed to merge clips.")
        
    # Successfully merged! Delete temporary clips.
    logger.info("Merge completed. Removing temporary clips.")
    for clip_name in request.clips:
        clip_path = os.path.join(settings.CLIP_DIR, clip_name)
        if os.path.exists(clip_path):
            try:
                os.remove(clip_path)
                logger.info(f"Deleted temporary clip: {clip_name}")
            except Exception as e:
                logger.warning(f"Could not remove temporary clip {clip_path}: {e}")
                
    return {
        "final_video": f"/merged/{final_filename}"
    }
