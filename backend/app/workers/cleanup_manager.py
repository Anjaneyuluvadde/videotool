import asyncio
import os
import time
from typing import List

from app.config import settings
from app.utils.logger import get_logger

logger = get_logger("cleanup_manager")

_cleanup_task: asyncio.Task = None
_stop_event: asyncio.Event = asyncio.Event()

class CleanupManager:
    @staticmethod
    def start_cleanup():
        """Start the periodic cleanup background task."""
        global _cleanup_task
        if _cleanup_task is None or _cleanup_task.done():
            _stop_event.clear()
            _cleanup_task = asyncio.create_task(CleanupManager._cleanup_loop())
            logger.info(
                "Background cleanup task started: every %s minutes, files expire after %s hours.",
                settings.CLEANUP_INTERVAL_MINUTES,
                settings.VIDEO_EXPIRY_HOURS,
            )

    @staticmethod
    async def stop_cleanup():
        """Stop the cleanup background task gracefully."""
        global _cleanup_task
        if _cleanup_task and not _cleanup_task.done():
            _stop_event.set()
            _cleanup_task.cancel()
            try:
                await _cleanup_task
            except asyncio.CancelledError:
                logger.info("Cleanup task cancelled during shutdown.")
            except Exception as exc:
                logger.warning("Cleanup task stopped with exception: %s", exc)

    @staticmethod
    async def _cleanup_loop():
        interval_seconds = settings.CLEANUP_INTERVAL_MINUTES * 60
        while not _stop_event.is_set():
            try:
                await CleanupManager.cleanup_expired_files()
            except Exception as exc:
                logger.error("Error during cleanup run: %s", exc)

            try:
                await asyncio.wait_for(_stop_event.wait(), timeout=interval_seconds)
            except asyncio.TimeoutError:
                continue

    @staticmethod
    async def cleanup_expired_files() -> int:
        """Delete expired files from configured directories."""
        expiration_seconds = settings.VIDEO_EXPIRY_HOURS * 3600
        now = time.time()
        expired_files_count = 0
        target_dirs: List[str] = [
            settings.CLIP_DIR,
            settings.MERGED_DIR,
            settings.TEMP_DIR,
            settings.DOWNLOAD_DIR,
        ]

        for directory in target_dirs:
            if not os.path.isdir(directory):
                continue

            for root, _, files in os.walk(directory):
                for filename in files:
                    file_path = os.path.join(root, filename)
                    try:
                        modified_time = os.path.getmtime(file_path)
                    except OSError as exc:
                        logger.debug("Could not stat file %s: %s", file_path, exc)
                        continue

                    age_seconds = now - modified_time
                    if age_seconds < expiration_seconds:
                        continue

                    try:
                        os.remove(file_path)
                        expired_files_count += 1
                        logger.info("Removed expired file: %s", file_path)
                    except PermissionError:
                        logger.warning(
                            "Skipping locked or in-use file during cleanup: %s", file_path
                        )
                    except OSError as exc:
                        logger.warning(
                            "Failed to remove expired file %s: %s", file_path, exc
                        )

        if expired_files_count:
            logger.info("Cleanup run completed, removed %s expired files.", expired_files_count)
        else:
            logger.debug("Cleanup run completed, no expired files found.")
        return expired_files_count
