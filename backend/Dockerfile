FROM python:3.10-slim

# Prevent python from writing pyc files and buffering stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies including FFmpeg and FFprobe
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /app

# Copy requirements and install python packages
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application files
COPY . /app/

# Create required media storage directories
RUN mkdir -p /app/downloads /app/clips /app/temp

# Expose FastAPI server port
EXPOSE 8000

# Start FastAPI application using Uvicorn
CMD ["python", "main.py"]
