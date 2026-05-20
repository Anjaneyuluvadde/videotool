import os
import asyncio
import json
import uuid
from typing import Dict, List, Any
from app.config import settings
from app.models.jobs import JobModel
from app.services.downloader import DownloaderService
from app.services.analyzer import AnalyzerService
from app.ffmpeg.processor import VideoProcessor
from app.utils.logger import get_logger

logger = get_logger("job_worker")

# Asynchronous queue for background tasks
job_queue: asyncio.Queue = asyncio.Queue()
# Reference to the background task worker
_worker_task: asyncio.Task = None

class JobManager:
    @staticmethod
    def start_worker():
        """
        Starts the background worker queue listener.
        """
        global _worker_task
        if _worker_task is None or _worker_task.done():
            _worker_task = asyncio.create_task(JobManager._worker_loop())
            logger.info("Background job worker queue listener started.")

    @staticmethod
    async def submit_job(youtube_url: str, selected_duration: int) -> str:
        """
        Submits a video clipping job to the queue.
        """
        job_id = str(uuid.uuid4())
        # Save to SQLite database
        JobModel.create_job(job_id, youtube_url, selected_duration)
        # Push to async queue
        await job_queue.put(job_id)
        logger.info(f"Submitted job {job_id} to queue.")
        return job_id

    @staticmethod
    async def _worker_loop():
        """
        Infinite worker loop that processes clipping jobs sequentially from the queue.
        """
        while True:
            job_id = await job_queue.get()
            try:
                logger.info(f"Processing job {job_id} started...")
                await JobManager._process_job(job_id)
            except Exception as e:
                logger.error(f"Critical failure processing job {job_id}: {e}")
            finally:
                job_queue.task_done()

    @staticmethod
    async def _process_job(job_id: str):
        job = JobModel.get_job(job_id)
        if not job:
            logger.error(f"Job {job_id} not found in database.")
            return

        url = job["youtube_url"]
        selected_duration = job["selected_duration"]
        downloaded_file = None

        try:
            # --- STAGE 1: Downloading Video (0% to 45%) ---
            JobModel.update_job(job_id, status="downloading", progress=0.0)
            
            # Fetch metadata first to get correct video details
            metadata = DownloaderService.fetch_video_metadata(url)
            if not metadata["success"]:
                raise Exception(f"Failed to resolve video details: {metadata.get('error', 'Unknown Error')}")
                
            JobModel.update_job(
                job_id, 
                title=metadata["title"], 
                thumbnail=metadata["thumbnail"],
                duration=metadata["duration"],
                progress=5.0
            )

            # Progress callback for the downloader
            def on_download_progress(percent: float):
                # Map 0-100% of download to 5% to 45% of total job progress
                overall_progress = 5.0 + (percent * 0.40)
                JobModel.update_job(job_id, progress=round(overall_progress, 1))

            downloaded_file = await DownloaderService.download_video(url, job_id, on_download_progress)
            if not downloaded_file or not os.path.exists(downloaded_file):
                raise FileNotFoundError("Video download file was not generated.")

            logger.info(f"Job {job_id} - Download completed. File: {downloaded_file}")

            # --- STAGE 2: Analyzing Metadata (45% to 50%) ---
            JobModel.update_job(job_id, status="analyzing", progress=45.0)
            analysis = AnalyzerService.analyze_video(downloaded_file)
            
            duration = analysis["duration"]
            in_width = analysis["width"]
            in_height = analysis["height"]
            
            # Save actual probed duration if needed
            JobModel.update_job(job_id, duration=duration, progress=50.0)
            logger.info(f"Job {job_id} - Probe complete. Duration: {duration}s, Dimensions: {in_width}x{in_height}")

            # --- STAGE 3: Clip Generation (Scale & Pad to 9:16) (50% to 100%) ---
            JobModel.update_job(job_id, status="generating", progress=50.0)
            
            # Calculate sequential clip segments and ensure no duration is lost.
            segments = []
            full_chunks = int(duration // selected_duration)
            remainder = duration - (full_chunks * selected_duration)
            remainder = 0.0 if abs(remainder) < 1e-3 else remainder

            if full_chunks == 0:
                segments.append((0.0, duration))
            else:
                for chunk_index in range(full_chunks):
                    start_time = float(chunk_index * selected_duration)
                    end_time = start_time + float(selected_duration)
                    segments.append((start_time, end_time))

                if remainder > 0:
                    # Absorb any remaining seconds into the final clip, preserving exact total duration.
                    last_start, last_end = segments[-1]
                    segments[-1] = (last_start, last_end + remainder)

            num_clips = len(segments)
            logger.info(
                f"Job {job_id} - Total duration {duration}s, selected chunk {selected_duration}s, "
                f"full_chunks={full_chunks}, remainder={remainder}s, generating {num_clips} clips..."
            )
            
            generated_clips = []
            
            for index, (start_sec, end_sec) in enumerate(segments):
                clip_id = str(uuid.uuid4())[:8]
                clip_filename = f"clip_{job_id}_{clip_id}.mp4"
                clip_path = os.path.join(settings.CLIP_DIR, clip_filename)
                clip_len = end_sec - start_sec
                
                # Dynamic scale & pad clip generation
                success = VideoProcessor.generate_clip(
                    video_path=downloaded_file,
                    start_time=start_sec,
                    duration=clip_len,
                    output_path=clip_path,
                    in_w=in_width,
                    in_h=in_height,
                    use_gpu=settings.USE_GPU
                )
                
                if success and os.path.exists(clip_path):
                    # Save clip relative path/url
                    clip_url = f"/clips/{clip_filename}"
                    generated_clips.append({
                        "id": clip_id,
                        "filename": clip_filename,
                        "url": clip_url,
                        "start": round(start_sec, 2),
                        "end": round(end_sec, 2),
                        "duration": round(clip_len, 2),
                        "resolution": "1080x1920"
                    })
                else:
                    logger.error(f"Job {job_id} - Failed to generate clip index {index}")
                
                # Update progress progressively
                clip_progress = 50.0 + (((index + 1) / num_clips) * 50.0)
                JobModel.update_job(
                    job_id, 
                    progress=round(clip_progress, 1),
                    clips=generated_clips
                )

            # --- STAGE 4: Completed ---
            if generated_clips:
                JobModel.update_job(job_id, status="completed", progress=100.0, clips=generated_clips)
                logger.info(f"Job {job_id} completed successfully with {len(generated_clips)} clips.")
            else:
                raise Exception("Failed to generate any vertical clips.")

        except Exception as e:
            logger.error(f"Error processing job {job_id}: {e}")
            JobModel.update_job(job_id, status="failed", progress=100.0, error=str(e))
            
        finally:
            # --- STAGE 5: Auto-Cleanup of Raw Temporary Downloads ---
            if downloaded_file and os.path.exists(downloaded_file):
                try:
                    os.remove(downloaded_file)
                    logger.info(f"Cleaned up temporary download file: {downloaded_file}")
                except Exception as cleanup_err:
                    logger.warning(f"Could not remove temp file {downloaded_file}: {cleanup_err}")
