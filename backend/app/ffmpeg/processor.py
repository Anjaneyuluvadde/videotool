import subprocess
import os
from app.config import settings
from app.utils.logger import get_logger

logger = get_logger("ffmpeg_processor")

class VideoProcessor:
    @classmethod
    def generate_clip(
        cls,
        video_path: str,
        start_time: float,
        duration: float,
        output_path: str,
        in_w: int = 0,
        in_h: int = 0,
        use_gpu: bool = False
    ) -> bool:
        """
        Extracts a segment of the video, scales and pads to 1080x1920 with premium dark gray background, and exports as MP4.
        """
        # Resolve/Probe input video dimensions if not supplied or invalid
        if in_w <= 0 or in_h <= 0:
            try:
                from app.services.analyzer import AnalyzerService
                analysis = AnalyzerService.analyze_video(video_path)
                in_w = analysis.get("width", 1920)
                in_h = analysis.get("height", 1080)
                logger.info(f"Dynamically resolved input video dimensions: {in_w}x{in_h}")
            except Exception as e:
                logger.warning(f"Failed to dynamically analyze video dimensions. Defaulting to 1920x1080. Error: {e}")
                in_w = 1920
                in_h = 1080

        # Construct dynamic FFmpeg filter:
        # 1. crop='trunc(iw*0.8/2)*2':'ih':'trunc(iw*0.1/2)*2':0 - crop center 80% width, full height, even pixel alignment
        # 2. scale='if(gt(iw*1400/ih,1080),1080,-2)':1400 - target portrait scale while keeping width <=1080
        # 3. setsar=1 - set Sample Aspect Ratio to 1:1 to prevent encoding distortion
        # 4. pad=1080:1920:(ow-iw)/2:(oh-ih)/2:0x111111 - pad to 1080x1920 with premium dark gray background
        filter_str = (
            "crop='trunc(iw*0.8/2)*2':'ih':'trunc(iw*0.1/2)*2':0,"
            "scale='if(gt(iw*1400/ih,1080),1080,-2)':1100,"
            "setsar=1,"
            "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:0x111111"
        )
        
        cmd = [
            "ffmpeg",
            "-ss", f"{start_time:.3f}",
            "-t", f"{duration:.3f}",
            "-i", video_path,
            "-vf", filter_str,
            "-an"
        ]
        
        # Configure Video Encoder and GPU parameters
        if use_gpu:
            logger.info("Attempting video generation using NVIDIA NVENC GPU acceleration...")
            gpu_cmd = cmd + [
                "-c:v", "h264_nvenc",
                "-preset", "fast",
                "-cq", "23",
                "-y",
                output_path
            ]
            try:
                subprocess.run(gpu_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
                logger.info("Clip generated successfully using GPU acceleration.")
                return True
            except subprocess.CalledProcessError as e:
                logger.warning(f"GPU NVENC encoding failed, falling back to CPU (libx264). Error: {e.stderr.decode('utf-8', errors='ignore')}")
                # Fall through to CPU execution
        
        # Standard CPU encoding (libx264)
        cpu_cmd = cmd + [
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-y",
            output_path
        ]
        
        try:
            logger.info(f"Running CPU clip generation from {start_time}s to {start_time+duration}s...")
            result = subprocess.run(cpu_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            logger.info("Clip generated successfully using CPU.")
            return True
        except subprocess.CalledProcessError as e:
            err_msg = e.stderr.decode("utf-8", errors="ignore")
            logger.error(f"FFmpeg CPU clip generation failed: {err_msg}")
            return False

    @classmethod
    def trim_clip(cls, input_path: str, output_path: str, duration: float) -> bool:
        """
        Trims a video to the specified duration.
        """
        cmd = [
            "ffmpeg",
            "-ss", "0",
            "-t", str(duration),
            "-i", input_path,
            "-c", "copy",
            "-y",
            output_path
        ]
        try:
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            return True
        except subprocess.CalledProcessError as e:
            err_msg = e.stderr.decode("utf-8", errors="ignore")
            logger.error(f"FFmpeg trim clip failed: {err_msg}")
            return False

    @classmethod
    def merge_clips(cls, clip_paths: list[str], output_path: str, use_gpu: bool = False) -> bool:
        """
        Merges multiple clips using FFmpeg concat method.
        Assumes all clips have the same resolution and codecs.
        """
        # Create concat file
        concat_file = os.path.join(settings.TEMP_DIR, "concat.txt")
        try:
            with open(concat_file, "w", encoding="utf-8") as f:
                for cp in clip_paths:
                    # FFmpeg concat requires absolute paths or relative to concat.txt,
                    # safely formatted with forward slashes
                    formatted_path = cp.replace('\\', '/')
                    f.write(f"file '{formatted_path}'\n")
            
            cmd = [
                "ffmpeg",
                "-f", "concat",
                "-safe", "0",
                "-i", concat_file,
            ]
            
            if use_gpu:
                gpu_cmd = cmd + [
                    "-c:v", "h264_nvenc",
                    "-preset", "fast",
                    "-cq", "23",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-y",
                    output_path
                ]
                try:
                    subprocess.run(gpu_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
                    logger.info("Clips merged successfully using GPU.")
                    return True
                except subprocess.CalledProcessError as e:
                    logger.warning(f"GPU merge failed, falling back to CPU. Error: {e.stderr.decode('utf-8', errors='ignore')}")
            
            cpu_cmd = cmd + [
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "192k",
                "-y",
                output_path
            ]
            
            subprocess.run(cpu_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            logger.info("Clips merged successfully using CPU.")
            return True
        except Exception as e:
            logger.error(f"Failed to merge clips: {str(e)}")
            return False
        finally:
            if os.path.exists(concat_file):
                os.remove(concat_file)
