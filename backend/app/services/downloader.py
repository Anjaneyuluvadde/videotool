import os
import asyncio
import socket
import time
from yt_dlp import YoutubeDL
from app.config import settings
from app.utils.logger import get_logger

logger = get_logger("downloader")

def progress_hook_wrapper(job_id, progress_callback):
    """
    Creates a yt-dlp progress hook that calls progress_callback with percentage.
    """
    def hook(d):
        if d.get('status') == 'downloading':
            downloaded = d.get('downloaded_bytes', 0)
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            if total > 0:
                percent = (downloaded / total) * 100
                # Scale downloading progress to occupy 0-90% of download phase, or just pass directly
                progress_callback(percent)
        elif d.get('status') == 'finished':
            progress_callback(100.0)
    return hook

class DownloaderService:
    @staticmethod
    def fetch_video_metadata(url: str) -> dict:
        """
        Validates the URL and fetches video title, thumbnail, and duration without downloading.
        """
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
        }
        try:
            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if not info:
                    raise Exception("Could not retrieve video information.")
                
                # Extract best title, thumbnail and duration
                title = info.get('title', 'Unknown YouTube Video')
                duration = info.get('duration', 0.0)
                
                # Fetch best thumbnail
                thumbnails = info.get('thumbnails', [])
                thumbnail = ""
                if thumbnails:
                    # Select highest quality thumbnail
                    thumbnail = thumbnails[-1].get('url', '')
                
                return {
                    "success": True,
                    "title": title,
                    "thumbnail": thumbnail,
                    "duration": duration,
                    "fps": info.get('fps'),
                    "width": info.get('width'),
                    "height": info.get('height')
                }
        except Exception as e:
            logger.error(f"Error fetching metadata for {url}: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    @staticmethod
    async def download_video(url: str, job_id: str, progress_callback) -> str:
        """
        Downloads a YouTube video to the temp directory with progress hook tracking.
        Runs yt-dlp in a thread pool to avoid blocking the FastAPI event loop.
        """
        output_template = os.path.join(settings.TEMP_DIR, f"{job_id}.%(ext)s")
        
        ydl_opts = {
            # Download high quality pre-merged MP4 format directly to bypass slow merging post-processors
            'format': 'best[height<=1080][ext=mp4]/best[ext=mp4]/best',
            'outtmpl': output_template,
            'quiet': True,
            'no_warnings': True,
            'progress_hooks': [progress_hook_wrapper(job_id, progress_callback)],
            'merge_output_format': 'mp4',
            'retries': 5,
            'fragment_retries': 5,
            'socket_timeout': 30,
            'continuedl': True,
            'nopart': True,
        }
        
        def run_dl():
            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                return ydl.prepare_filename(info)
                
        loop = asyncio.get_event_loop()
        attempt = 0
        max_attempts = 3
        last_error = None

        while attempt < max_attempts:
            attempt += 1
            try:
                # Execute yt-dlp blocking call in an executor thread
                file_path = await loop.run_in_executor(None, run_dl)

                # Since merge_output_format is set to mp4, yt-dlp will save it as mp4.
                # However, prepare_filename might return a different extension if it wasn't merged yet.
                # Let's ensure we return the actual existing mp4 path.
                base, _ = os.path.splitext(file_path)
                actual_path = base + ".mp4"
                if os.path.exists(actual_path):
                    return actual_path
                elif os.path.exists(file_path):
                    return file_path
                else:
                    # Search for any file with job_id in temp directory
                    for filename in os.listdir(settings.TEMP_DIR):
                        if filename.startswith(job_id):
                            return os.path.join(settings.TEMP_DIR, filename)
                    raise FileNotFoundError("Downloaded file could not be located.")
            except Exception as e:
                last_error = e
                message = str(e)
                if isinstance(e, socket.gaierror) or 'Failed to resolve' in message or 'getaddrinfo failed' in message:
                    logger.warning(
                        f"Network/DNS error downloading job {job_id} (attempt {attempt}/{max_attempts}): {e}"
                    )
                else:
                    logger.warning(
                        f"Download attempt {attempt}/{max_attempts} failed for job {job_id}: {e}"
                    )

                if attempt >= max_attempts:
                    break

                # Pause a moment before retrying to give DNS or network time to recover.
                time.sleep(3)

        logger.error(f"Failed download for job {job_id} after {max_attempts} attempts: {last_error}")
        raise last_error
