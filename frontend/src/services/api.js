import axios from 'axios';

// Prefer an environment-configured backend URL, otherwise use a relative path
// so the dev server can proxy `/api` to the backend and production can host
// the frontend and backend under the same origin.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const videoApi = {
  /**
   * Fast metadata probe of a YouTube URL.
   * Yields title, thumbnail link, and duration details.
   */
  analyze: async (youtubeUrl) => {
    const response = await api.post('/analyze', { youtube_url: youtubeUrl });
    return response.data;
  },

  /**
   * Submits a video URL for background clipping, scaling and padding.
   * Yields a queue job_id.
   */
  generateClips: async (youtubeUrl, selectedDuration) => {
    const response = await api.post('/generate-clips', {
      youtube_url: youtubeUrl,
      selected_duration: selectedDuration,
    });
    return response.data;
  },

  /**
   * Polls or queries status, stage percentage, and output clips of a job.
   */
  getJobStatus: async (jobId) => {
    const response = await api.get(`/status/${jobId}`);
    return response.data;
  },

  /**
   * Fetches historical lists of jobs and generated clips.
   */
  getAllJobs: async () => {
    const response = await api.get('/clips');
    return response.data;
  },

  /**
   * Merges selected clips into a final 1-minute vertical short.
   */
  mergeClips: async (clips, finalDuration = null) => {
    const payload = { clips };
    if (finalDuration !== null) payload.final_duration = finalDuration;
    const response = await api.post('/merge-clips', payload);
    return response.data;
  },
};

export default videoApi;
