import sqlite3
import json
import os
from typing import List, Dict, Any, Optional
from app.config import settings

def get_db_connection():
    conn = sqlite3.connect(settings.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            youtube_url TEXT NOT NULL,
            title TEXT,
            thumbnail TEXT,
            duration REAL,
            selected_duration INTEGER,
            status TEXT NOT NULL,
            progress REAL DEFAULT 0,
            error TEXT,
            clips TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

# Initialize database on import
init_db()

class JobModel:
    @staticmethod
    def create_job(job_id: str, youtube_url: str, selected_duration: int) -> Dict[str, Any]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO jobs (id, youtube_url, selected_duration, status, progress)
            VALUES (?, ?, ?, ?, ?)
            """,
            (job_id, youtube_url, selected_duration, "pending", 0.0)
        )
        conn.commit()
        conn.close()
        return {
            "id": job_id,
            "youtube_url": youtube_url,
            "selected_duration": selected_duration,
            "status": "pending",
            "progress": 0.0,
            "clips": []
        }

    @staticmethod
    def update_job(
        job_id: str,
        status: Optional[str] = None,
        progress: Optional[float] = None,
        title: Optional[str] = None,
        thumbnail: Optional[str] = None,
        duration: Optional[float] = None,
        error: Optional[str] = None,
        clips: Optional[List[Dict[str, Any]]] = None
    ):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        updates = []
        params = []
        
        if status is not None:
            updates.append("status = ?")
            params.append(status)
        if progress is not None:
            updates.append("progress = ?")
            params.append(progress)
        if title is not None:
            updates.append("title = ?")
            params.append(title)
        if thumbnail is not None:
            updates.append("thumbnail = ?")
            params.append(thumbnail)
        if duration is not None:
            updates.append("duration = ?")
            params.append(duration)
        if error is not None:
            updates.append("error = ?")
            params.append(error)
        if clips is not None:
            updates.append("clips = ?")
            params.append(json.dumps(clips))
            
        if not updates:
            conn.close()
            return
            
        params.append(job_id)
        cursor.execute(
            f"UPDATE jobs SET {', '.join(updates)} WHERE id = ?",
            tuple(params)
        )
        conn.commit()
        conn.close()

    @staticmethod
    def get_job(job_id: str) -> Optional[Dict[str, Any]]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return None
            
        job = dict(row)
        if job.get("clips"):
            job["clips"] = json.loads(job["clips"])
        else:
            job["clips"] = []
            
        return job

    @staticmethod
    def get_all_jobs() -> List[Dict[str, Any]]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM jobs ORDER BY created_at DESC")
        rows = cursor.fetchall()
        conn.close()
        
        jobs = []
        for row in rows:
            job = dict(row)
            if job.get("clips"):
                job["clips"] = json.loads(job["clips"])
            else:
                job["clips"] = []
            jobs.append(job)
            
        return jobs
