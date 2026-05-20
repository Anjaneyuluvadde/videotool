import subprocess
import json
import os
from app.utils.logger import get_logger

logger = get_logger("analyzer")

class AnalyzerService:
    @staticmethod
    def analyze_video(video_path: str) -> dict:
        """
        Uses ffprobe to extract rich technical metadata from the downloaded video:
        - total duration (seconds)
        - frame width & height
        - FPS
        - video codec
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found at {video_path}")
            
        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-show_format",
            video_path
        ]
        
        try:
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            metadata = json.loads(result.stdout)
            
            # Find the first video stream
            video_stream = None
            for stream in metadata.get("streams", []):
                if stream.get("codec_type") == "video":
                    video_stream = stream
                    break
                    
            if not video_stream:
                raise ValueError("No video stream found in the media file.")
                
            # Extract width, height, and codec
            width = int(video_stream.get("width", 0))
            height = int(video_stream.get("height", 0))
            codec = video_stream.get("codec_name", "unknown")
            
            # Extract FPS
            fps_str = video_stream.get("avg_frame_rate", "30/1")
            fps = 30.0
            if "/" in fps_str:
                try:
                    num, den = fps_str.split("/")
                    if float(den) > 0:
                        fps = round(float(num) / float(den), 2)
                except Exception:
                    pass
            else:
                try:
                    fps = float(fps_str)
                except ValueError:
                    pass
                    
            # Extract duration (look in stream first, fall back to format)
            duration = float(video_stream.get("duration", 0.0))
            if duration == 0.0:
                duration = float(metadata.get("format", {}).get("duration", 0.0))
                
            return {
                "duration": duration,
                "width": width,
                "height": height,
                "fps": fps,
                "codec": codec,
                "resolution": f"{width}x{height}"
            }
            
        except subprocess.CalledProcessError as e:
            logger.error(f"ffprobe execution failed: {e.stderr}")
            raise Exception(f"Failed to analyze video: {e.stderr}")
        except Exception as e:
            logger.error(f"Error parsing metadata: {e}")
            raise e
