import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Youtube, 
  Video, 
  Download, 
  Play, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Cpu, 
  Layers, 
  Clock, 
  Monitor, 
  History, 
  ExternalLink,
  Loader2
} from 'lucide-react';
import { videoApi } from './services/api';

const BACKEND_URL = 'http://127.0.0.1:8000';

export default function App() {
  // App navigation
  const [activeTab, setActiveTab] = useState('generator'); // 'generator' | 'active' | 'history'

  // Input states
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedDuration, setSelectedDuration] = useState(20); // 10 | 20 | 30 | 40

  // Loading states
  const [isProbing, setIsProbing] = useState(false);
  const [isQueuing, setIsQueuing] = useState(false);
  const [appError, setAppError] = useState(null);

  // Probed Video Metadata
  const [probedVideo, setProbedVideo] = useState(null);

  // Background Job Monitoring
  const [activeJobId, setActiveJobId] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [pollIntervalId, setPollIntervalId] = useState(null);

  // Clips and History Vault
  const [jobsHistory, setJobsHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // 9:16 Preview Modal
  const [previewClip, setPreviewClip] = useState(null);

  // Merging States
  const [selectedClips, setSelectedClips] = useState([]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergedVideoUrl, setMergedVideoUrl] = useState(null);
  const [finalDuration, setFinalDuration] = useState(60); // seconds, user-entered final target

  // Load history on mount
  useEffect(() => {
    fetchHistory();
  }, []);

  // Poll active job status
  useEffect(() => {
    if (!activeJobId) {
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
        setPollIntervalId(null);
      }
      return;
    }

    // Initial fetch
    fetchJobStatus(activeJobId);

    // Setup polling every 2 seconds
    const interval = setInterval(() => {
      fetchJobStatus(activeJobId);
    }, 2000);

    setPollIntervalId(interval);

    return () => clearInterval(interval);
  }, [activeJobId]);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalId) clearInterval(pollIntervalId);
    };
  }, [pollIntervalId]);

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const data = await videoApi.getAllJobs();
      if (data.success) {
        setJobsHistory(data.jobs || []);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchJobStatus = async (jobId) => {
    try {
      const data = await videoApi.getJobStatus(jobId);
      setActiveJob(data);

      if (data.status === 'completed' || data.status === 'failed') {
        // Stop polling
        setActiveJobId(null);
        // Refresh vault
        fetchHistory();
      }
    } catch (err) {
      console.error(`Error fetching job status for ${jobId}:`, err);
      setAppError('Failed to synchronize status with server.');
      setActiveJobId(null);
    }
  };

  // Validate YouTube URL structure
  const isValidYoutubeUrl = (url) => {
    const p = /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
    return url.match(p) !== null;
  };

  // Handle YouTube URL input analysis (Metadata probe)
  const handleUrlSubmit = async (e) => {
    e.preventDefault();
    setAppError(null);
    setProbedVideo(null);

    if (!youtubeUrl) {
      setAppError('Please enter a YouTube link.');
      return;
    }

    if (!isValidYoutubeUrl(youtubeUrl)) {
      setAppError('Invalid link. Must be a valid YouTube watch or video URL (e.g. youtube.com/watch?v=...)');
      return;
    }

    setIsProbing(true);
    try {
      const data = await videoApi.analyze(youtubeUrl);
      setProbedVideo(data);
    } catch (err) {
      console.error(err);
      setAppError(
        err.response?.data?.detail || 
        'Could not fetch details. Make sure the video is public and isn\'t age-restricted.'
      );
    } finally {
      setIsProbing(false);
    }
  };

  // Queue a new clipping job
  const handleQueueJob = async () => {
    if (!probedVideo || !youtubeUrl) return;
    setAppError(null);
    setIsQueuing(true);

    try {
      const result = await videoApi.generateClips(youtubeUrl, selectedDuration);
      if (result.success) {
        // Track this active job
        setActiveJobId(result.job_id);
        setActiveJob({
          id: result.job_id,
          youtube_url: youtubeUrl,
          title: probedVideo.title,
          thumbnail: probedVideo.thumbnail,
          status: 'pending',
          progress: 0.0,
          clips: []
        });
        
        // Reset inputs
        setYoutubeUrl('');
        setProbedVideo(null);
        
        // Navigate to processing tab
        setActiveTab('active');
      }
    } catch (err) {
      console.error(err);
      setAppError(err.response?.data?.detail || 'Failed to submit job to the processing queue.');
    } finally {
      setIsQueuing(false);
    }
  };

  // Quick reset
  const handleReset = () => {
    setYoutubeUrl('');
    setProbedVideo(null);
    setAppError(null);
  };

  const [mergeError, setMergeError] = useState(null);

  const handleMerge = async () => {
    if (selectedClips.length === 0) return;
    setMergeError(null);
    setIsMerging(true);
    setMergedVideoUrl(null);
    try {
      const filenames = selectedClips.map(c => c.filename);
      // Validate target duration
      const total = selectedClips.reduce((acc, c) => acc + c.duration, 0);
      if (finalDuration && total + 1e-3 < Number(finalDuration)) {
        setMergeError('Selected clips total is less than requested final duration.');
        setIsMerging(false);
        return;
      }
      const res = await videoApi.mergeClips(filenames, Number(finalDuration));
      setMergedVideoUrl(res.final_video);
    } catch (err) {
      console.error(err);
      setMergeError(err.response?.data?.detail || 'Failed to merge clips.');
    } finally {
      setIsMerging(false);
    }
  };

  const [draggedItemIndex, setDraggedItemIndex] = useState(null);

  const handleDragStart = (e, index) => {
    setDraggedItemIndex(index);
    // Firefox requires setting data in dragStart
    e.dataTransfer.setData("text/plain", index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnter = (e, index) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === index) return;
    setSelectedClips((prevClips) => {
      const newClips = [...prevClips];
      const draggedClip = newClips[draggedItemIndex];
      newClips.splice(draggedItemIndex, 1);
      newClips.splice(index, 0, draggedClip);
      setDraggedItemIndex(index);
      return newClips;
    });
  };

  const handleDragEnd = () => setDraggedItemIndex(null);

  return (
    <div className="relative min-h-screen pb-20 z-0">
      {/* Background Ambience */}
      <div className="ambient-bg" />
      <div className="ambient-orb-1" />
      <div className="ambient-orb-2" />

      {/* Navigation Header */}
      <nav className="glass-panel sticky top-0 z-40 border-b border-white/5 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-primary-600 to-accent-500 rounded-xl shadow-glass-neon">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                AI Vertical Video <span className="text-gradient">Generator</span>
              </h1>
              <p className="text-xs text-dark-muted font-medium">Landscape to 9:16 Shorts, Reels & TikToks</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex bg-slate-900/80 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setActiveTab('generator')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                activeTab === 'generator'
                  ? 'bg-gradient-to-r from-primary-600 to-primary-800 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Video className="w-4 h-4" />
              Generator
            </button>
            <button
              onClick={() => setActiveTab('active')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold relative transition-all duration-300 ${
                activeTab === 'active'
                  ? 'bg-gradient-to-r from-primary-600 to-primary-800 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cpu className="w-4 h-4" />
              Active Queue
              {activeJobId && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-accent-500 border border-[#060913]"></span>
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setActiveTab('history');
                fetchHistory();
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                activeTab === 'history'
                  ? 'bg-gradient-to-r from-primary-600 to-primary-800 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="w-4 h-4" />
              Clips Vault
            </button>
            <button
              onClick={() => setActiveTab('merger')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold relative transition-all duration-300 ${
                activeTab === 'merger'
                  ? 'bg-gradient-to-r from-primary-600 to-primary-800 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              Clip Merger
              {selectedClips.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-500 text-[10px] font-bold text-black border border-[#060913]">
                  {selectedClips.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
        
        {/* Global Error Banner */}
        {appError && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-red-950/40 border border-red-500/20 rounded-2xl flex items-start gap-3 backdrop-blur-sm"
          >
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-red-200">Operation Error</h4>
              <p className="text-xs text-red-400 mt-1">{appError}</p>
            </div>
            <button onClick={() => setAppError(null)} className="text-red-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Tab 1: Clip Generator (Input Screen) */}
        {activeTab === 'generator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Input Form & Controls */}
            <div className="lg:col-span-7 flex flex-col gap-8">
              
              {/* Form panel */}
              <div className="glass-panel rounded-3xl p-6 sm:p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary-500/5 rounded-full filter blur-xl" />
                
                <h2 className="text-xl sm:text-2xl font-extrabold text-white mb-2">Create Vertical Shorts</h2>
                <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                  Provide any standard landscape 16:9 YouTube video. Our system will download, analyze the video, and scale it perfectly into a 9:16 vertical frame with black padding to preserve the entire video without cropping. It will then export download links optimized for YouTube Shorts, Reels, and TikTok.
                </p>

                <form onSubmit={handleUrlSubmit} className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                      YouTube Video Link
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Youtube className="h-5 w-5 text-red-500" />
                      </div>
                      <input
                        type="text"
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        disabled={isProbing || isQueuing}
                        className="block w-full pl-11 pr-4 py-3.5 bg-slate-950/80 border border-white/10 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 font-medium transition-all"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={isProbing || isQueuing}
                      className="glow-btn flex-1 flex items-center justify-center gap-2 py-3 px-6 bg-gradient-to-r from-primary-600 to-accent-600 hover:from-primary-500 hover:to-accent-500 text-white rounded-2xl font-bold shadow-lg shadow-primary-900/20 disabled:opacity-50 transition-all cursor-pointer"
                    >
                      {isProbing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Analyzing Video...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5 text-accent-200" />
                          Fetch Video Details
                        </>
                      )}
                    </button>
                    {youtubeUrl && (
                      <button
                        type="button"
                        onClick={handleReset}
                        className="py-3.5 px-4 bg-slate-900 hover:bg-slate-800 border border-white/5 text-slate-300 hover:text-white rounded-2xl transition-all"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Clip duration selector */}
              <div className="glass-panel rounded-3xl p-6 sm:p-8">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">
                  Select Target Clip Duration
                </h3>
                <div className="flex items-center gap-4 bg-slate-950/80 border border-white/10 rounded-2xl p-2 relative">
                  <div className="pl-4 pr-2 pointer-events-none text-slate-400">
                    <Clock className="w-6 h-6" />
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={selectedDuration}
                    onChange={(e) => setSelectedDuration(parseInt(e.target.value) || '')}
                    placeholder="20"
                    disabled={isQueuing}
                    className="block w-full py-3 bg-transparent text-white text-2xl font-extrabold placeholder-slate-600 focus:outline-none"
                  />
                  <div className="pr-6 text-slate-400 font-bold uppercase tracking-widest text-sm">
                    Seconds
                  </div>
                </div>
                <div className="mt-6 p-3 bg-slate-950/40 rounded-xl border border-white/5 flex gap-2.5 items-start">
                  <Layers className="w-4 h-4 text-primary-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-400 leading-relaxed">
                    The platform splits the long video into sequential segments of <span className="font-bold text-white">{selectedDuration} seconds</span>. Each segment will be scaled and padded with a black background to perfectly fit a vertical 9:16 frame.
                  </p>
                </div>
              </div>
            </div>

            {/* Video Preview & Submit Queue */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              <AnimatePresence mode="wait">
                {probedVideo ? (
                  <motion.div
                    key="video-details"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="glass-panel rounded-3xl p-6 flex flex-col border border-white/10"
                  >
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      Probed Metadata
                    </h3>

                    {/* Thumbnail representation */}
                    <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-white/5 shadow-inner group">
                      {probedVideo.thumbnail ? (
                        <img
                          src={probedVideo.thumbnail}
                          alt="Video Cover"
                          className="w-full h-full object-cover group-hover:scale-105 transition-all duration-700"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          <Youtube className="w-12 h-12" />
                        </div>
                      )}
                      {probedVideo.duration && (
                        <span className="absolute bottom-3 right-3 px-2 py-1 bg-black/85 text-xs text-white font-extrabold rounded-md border border-white/10">
                          {probedVideo.formatted_duration || `${Math.round(probedVideo.duration)}s`}
                        </span>
                      )}
                    </div>

                    <h4 className="text-md font-bold text-white mt-4 line-clamp-2 leading-snug">
                      {probedVideo.title}
                    </h4>

                    {/* Meta stats tags */}
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="bg-slate-950/60 p-2.5 rounded-xl border border-white/5 flex flex-col">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Format Mode</span>
                        <span className="text-xs text-white font-bold mt-0.5">16:9 Landscape</span>
                      </div>
                      <div className="bg-slate-950/60 p-2.5 rounded-xl border border-white/5 flex flex-col">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Total Length</span>
                        <span className="text-xs text-white font-bold mt-0.5">
                          {Math.round(probedVideo.duration)} Seconds
                        </span>
                      </div>
                    </div>

                    {/* Process Action */}
                    <button
                      onClick={handleQueueJob}
                      disabled={isQueuing}
                      className="glow-btn w-full mt-6 flex items-center justify-center gap-3 py-4 bg-gradient-to-r from-accent-600 to-primary-600 hover:from-accent-500 hover:to-primary-500 text-white rounded-2xl font-extrabold shadow-lg shadow-accent-950/20 disabled:opacity-50 transition-all cursor-pointer"
                    >
                      {isQueuing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Submitting Pipeline...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5 text-yellow-300" />
                          Generate Vertical Clips
                        </>
                      )}
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full glass-panel rounded-3xl p-8 flex flex-col items-center justify-center text-center border border-dashed border-white/10 min-h-[300px]"
                  >
                    <div className="p-4 bg-slate-900/60 rounded-full border border-white/5 mb-4 text-slate-400 animate-pulse-slow">
                      <Youtube className="w-8 h-8" />
                    </div>
                    <h4 className="text-white font-bold mb-1">Awaiting YouTube link</h4>
                    <p className="text-xs text-slate-400 max-w-[280px] leading-relaxed">
                      Enter a link on the left to analyze the duration and launch the 9:16 vertical pipeline.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
        )}

        {/* Tab 2: Processing Dashboard (Active Task) */}
        {activeTab === 'active' && (
          <div className="max-w-3xl mx-auto">
            {activeJob ? (
              <div className="glass-panel rounded-3xl p-6 sm:p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/5 rounded-full filter blur-2xl" />
                
                <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-primary-950 text-primary-300 border border-primary-500/20 rounded-md text-[10px] font-extrabold tracking-wider uppercase">
                      JOB PIPELINE
                    </span>
                    <span className="text-xs text-slate-400 font-mono select-all">#{(activeJob.id || activeJob.job_id || '').slice(0, 8)}...</span>
                  </div>
                  
                  {/* Status Badge */}
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    activeJob.status === 'completed' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                    activeJob.status === 'failed' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                    'bg-primary-500/10 text-primary-400 border border-primary-500/20 animate-pulse'
                  }`}>
                    {activeJob.status.toUpperCase()}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-6 mb-8">
                  {activeJob.thumbnail && (
                    <img 
                      src={activeJob.thumbnail} 
                      alt="Thumbnail" 
                      className="w-full sm:w-44 aspect-video sm:aspect-square object-cover rounded-2xl bg-slate-900 border border-white/5" 
                    />
                  )}
                  <div className="flex-1 flex flex-col justify-center">
                    <h3 className="text-lg font-bold text-white leading-snug line-clamp-2 mb-2">{activeJob.title}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-400 font-medium">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Target: {activeJob.selected_duration}s clips
                      </span>
                      {activeJob.duration && (
                        <span>• Length: {Math.round(activeJob.duration)}s</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress bar and logs */}
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between text-sm font-extrabold mb-2">
                      <span className="text-slate-300 flex items-center gap-2">
                        {activeJob.status === 'downloading' && 'Downloading high-quality video...'}
                        {activeJob.status === 'analyzing' && 'Analyzing media dimensions...'}
                        {activeJob.status === 'generating' && `Generating 9:16 vertical clips...`}
                        {activeJob.status === 'completed' && 'Vertical clips successfully generated!'}
                        {activeJob.status === 'failed' && 'Job process failed.'}
                      </span>
                      <span className="text-primary-400">{activeJob.progress}%</span>
                    </div>

                    {/* Progress track */}
                    <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-white/5">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${activeJob.progress}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className="h-full bg-gradient-to-r from-primary-500 via-accent-500 to-accent-600 rounded-full"
                      />
                    </div>
                  </div>

                  {/* Flow pipeline visual */}
                  <div className="grid grid-cols-4 gap-2 pt-4">
                    {[
                      { stage: 'downloading', label: 'Download' },
                      { stage: 'analyzing', label: 'Analyze' },
                      { stage: 'generating', label: 'Format 9:16' },
                      { stage: 'completed', label: 'Export 9:16' }
                    ].map((step, idx) => {
                      const stages = ['pending', 'downloading', 'analyzing', 'generating', 'completed', 'failed'];
                      const activeIdx = stages.indexOf(activeJob.status);
                      const stepIdx = stages.indexOf(step.stage);
                      
                      let isCurrent = activeJob.status === step.stage;
                      let isDone = stepIdx < activeIdx && activeJob.status !== 'failed';
                      if (activeJob.status === 'completed') isDone = true;
                      
                      return (
                        <div key={idx} className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border transition-all duration-500 ${
                            isDone ? 'bg-green-500/10 border-green-500 text-green-400' :
                            isCurrent ? 'bg-primary-500/10 border-primary-500 text-primary-400 shadow-glass-neon' :
                            activeJob.status === 'failed' && stepIdx >= activeIdx ? 'bg-slate-900 border-white/5 text-slate-600' :
                            'bg-slate-950 border-white/5 text-slate-500'
                          }`}>
                            {isDone ? '✓' : idx + 1}
                          </div>
                          <span className={`text-[10px] font-bold mt-2 uppercase ${
                            isCurrent ? 'text-primary-400' : 'text-slate-500'
                          }`}>
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Failed Message */}
                  {activeJob.status === 'failed' && activeJob.error && (
                    <div className="p-4 bg-red-950/30 border border-red-500/20 rounded-2xl flex items-start gap-3 mt-6">
                      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                      <div>
                        <h4 className="text-sm font-bold text-red-200">Error Description</h4>
                        <p className="text-xs text-red-400 mt-1">{activeJob.error}</p>
                        <button 
                          onClick={() => {
                            setYoutubeUrl(activeJob.youtube_url);
                            setSelectedDuration(activeJob.selected_duration);
                            setActiveTab('generator');
                            setActiveJob(null);
                          }}
                          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 border border-red-500/20 text-red-200 text-xs font-semibold rounded-lg transition-all"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Retry Configuration
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Completed result links */}
                  {activeJob.status === 'completed' && activeJob.clips && activeJob.clips.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="pt-6 border-t border-white/5"
                    >
                      <h4 className="text-sm font-bold text-slate-200 mb-4">Exported 9:16 Mobile Clips</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {activeJob.clips.map((clip) => (
                          <div 
                            key={clip.id}
                            className="bg-slate-950/60 p-3 rounded-xl border border-white/5 flex items-center justify-between"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-bold text-white">Clip segment #{clip.id}</span>
                              <span className="text-[10px] text-slate-400 font-semibold">
                                {clip.start}s - {clip.end}s ({clip.duration}s)
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setPreviewClip(clip)}
                                className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-lg transition-all border border-white/5"
                                title="Preview 9:16 Portrait"
                              >
                                <Play className="w-3.5 h-3.5" />
                              </button>
                              <a
                                href={`${BACKEND_URL}${clip.url}`}
                                download
                                target="_blank"
                                rel="noreferrer"
                                className="p-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-all shadow-md"
                                title="Download MP4"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            ) : (
              <div className="glass-panel rounded-3xl p-8 text-center border border-dashed border-white/10 min-h-[300px] flex flex-col items-center justify-center">
                <Cpu className="w-10 h-10 text-slate-600 mb-4 animate-pulse" />
                <h4 className="text-white font-bold mb-1">No Active Tasks</h4>
                <p className="text-xs text-slate-400 max-w-[280px] leading-relaxed mb-6">
                  You do not have any vertical conversion tasks processing in the background right now.
                </p>
                <button
                  onClick={() => setActiveTab('generator')}
                  className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-800 text-white rounded-xl text-xs font-bold shadow-md hover:from-primary-500"
                >
                  Configure New Clip
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Clips Vault (History Grid) */}
        {activeTab === 'history' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-white">9:16 Clips Vault</h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Your generated dynamic video library</p>
              </div>
              <button
                onClick={fetchHistory}
                disabled={isLoadingHistory}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-white/5 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {isLoadingHistory ? (
              <div className="h-60 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-primary-400 animate-spin" />
              </div>
            ) : jobsHistory.length === 0 ? (
              <div className="glass-panel rounded-3xl p-8 text-center border border-dashed border-white/10 min-h-[300px] flex flex-col items-center justify-center">
                <History className="w-10 h-10 text-slate-600 mb-4" />
                <h4 className="text-white font-bold mb-1">Vault is empty</h4>
                <p className="text-xs text-slate-400 max-w-[280px] leading-relaxed mb-6">
                  Start generating clips to fill your Vault with ready-to-share YouTube Shorts, Instagram Reels, and TikTok clips.
                </p>
                <button
                  onClick={() => setActiveTab('generator')}
                  className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-800 text-white rounded-xl text-xs font-bold"
                >
                  Create First Clip
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {jobsHistory.map((job) => {
                  const completedClips = job.clips || [];
                  if (completedClips.length === 0 && job.status !== 'failed') return null;
                  
                  return (
                    <div 
                      key={job.id} 
                      className="glass-panel rounded-3xl p-6 border border-white/5"
                    >
                      {/* Job Header */}
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-white/5 pb-4 mb-5">
                        <div className="flex items-start gap-4">
                          {job.thumbnail && (
                            <img 
                              src={job.thumbnail} 
                              alt="Thumbnail" 
                              className="w-16 h-12 object-cover rounded-lg border border-white/5 shrink-0 bg-slate-900" 
                            />
                          )}
                          <div>
                            <h3 className="text-sm font-bold text-white leading-tight line-clamp-1">{job.title}</h3>
                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 font-semibold mt-1">
                              <span className="px-1.5 py-0.5 bg-slate-950 rounded border border-white/5 text-slate-300">
                                {job.selected_duration}s Clips
                              </span>
                              <span>• Duration: {Math.round(job.duration)}s</span>
                              <span className="text-slate-500 font-mono">#{(job.id || job.job_id || '').slice(0, 8)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Status tag */}
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                            job.status === 'completed' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                            job.status === 'failed' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                            'bg-primary-500/10 text-primary-400 border border-primary-500/20'
                          }`}>
                            {job.status.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {/* Render clips inside this job */}
                      {job.status === 'failed' ? (
                        <div className="p-3 bg-red-950/20 border border-red-500/10 rounded-xl flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                          <span className="text-xs text-red-400">Failed: {job.error || 'Unknown process error.'}</span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {completedClips.map((clip) => {
                            const isSelected = selectedClips.some(c => c.id === clip.id);
                            const toggleClipSelection = () => {
                              setSelectedClips(prev => {
                                if (isSelected) return prev.filter(c => c.id !== clip.id);
                                return [...prev, { ...clip, parentJobId: job.id, parentThumbnail: job.thumbnail }];
                              });
                            };
                            return (
                            <div 
                              key={clip.id}
                              className={`bg-slate-950/60 rounded-2xl border ${isSelected ? 'border-accent-500 shadow-glass-neon' : 'border-white/5'} overflow-hidden flex flex-col group hover:border-primary-500/30 transition-all duration-300 relative`}
                            >
                              {/* 9:16 Aspect mock placeholder */}
                              <div className="relative aspect-[9/16] bg-slate-900/80 flex flex-col items-center justify-center border-b border-white/5 group-hover:bg-slate-900 transition-all duration-500 overflow-hidden cursor-pointer" onClick={toggleClipSelection}>
                                {job.thumbnail && (
                                  <img 
                                    src={job.thumbnail} 
                                    alt="Mock" 
                                    className="absolute inset-0 w-full h-full object-cover opacity-15 filter blur-sm scale-110" 
                                  />
                                )}
                                
                                <div className="absolute top-3 left-3 flex flex-col gap-2 z-20">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); toggleClipSelection(); }}
                                    className={`w-6 h-6 rounded flex items-center justify-center border ${isSelected ? 'bg-accent-500 border-accent-400' : 'bg-black/75 border-white/20'}`}
                                  >
                                    {isSelected && <CheckCircle2 className="w-4 h-4 text-black" />}
                                  </button>
                                  <div className="bg-black/75 px-2 py-0.5 text-[9px] text-white font-extrabold rounded border border-white/10 uppercase tracking-wider">
                                    {clip.resolution}
                                  </div>
                                </div>
                                <span className="absolute bottom-3 left-3 bg-black/75 px-2 py-0.5 text-[9px] text-white font-extrabold rounded border border-white/10 font-mono z-20">
                                  {clip.start}s - {clip.end}s
                                </span>

                                <button
                                  onClick={(e) => { e.stopPropagation(); setPreviewClip(clip); }}
                                  className="w-12 h-12 bg-primary-600 hover:bg-primary-500 hover:scale-110 text-white rounded-full flex items-center justify-center shadow-lg shadow-primary-950/30 z-10 transition-all cursor-pointer opacity-80 hover:opacity-100"
                                >
                                  <Play className="w-5 h-5 pl-0.5 fill-white" />
                                </button>
                              </div>

                              <div className="p-3 flex items-center justify-between bg-slate-900/30">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs font-bold text-white">Segment #{clip.id}</span>
                                  <span className="text-[9px] text-slate-400 font-bold">{clip.duration}s Clip duration</span>
                                </div>
                                <a
                                  href={`${BACKEND_URL}${clip.url}`}
                                  download
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 bg-slate-800 hover:bg-primary-600 text-slate-300 hover:text-white rounded-lg transition-all border border-white/5"
                                  title="Download MP4"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              </div>
                            </div>
                          )})}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Merger Dashboard */}
        {activeTab === 'merger' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-white">Clip Merger</h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Combine your selected vertical clips into a 1-minute video</p>
              </div>
            </div>

            {mergeError && (
              <div className="p-4 bg-red-950/30 border border-red-500/20 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                <p className="text-sm text-red-400">{mergeError}</p>
              </div>
            )}

            {selectedClips.length === 0 ? (
              <div className="glass-panel rounded-3xl p-8 text-center border border-dashed border-white/10 min-h-[300px] flex flex-col items-center justify-center">
                <Layers className="w-10 h-10 text-slate-600 mb-4" />
                <h4 className="text-white font-bold mb-1">No Clips Selected</h4>
                <p className="text-xs text-slate-400 max-w-[280px] leading-relaxed mb-6">
                  Go to the Clips Vault and select clips by clicking them. They will appear here for merging.
                </p>
                <button
                  onClick={() => setActiveTab('history')}
                  className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-800 text-white rounded-xl text-xs font-bold shadow-md hover:from-primary-500"
                >
                  Go to Vault
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Selected Clips List */}
                <div className="glass-panel rounded-3xl p-6 border border-white/5 space-y-4">
                  <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-4">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Selected Sequence</h3>
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-1 bg-primary-950/50 text-primary-400 text-[10px] font-bold rounded-lg border border-primary-500/20">
                        Total: {selectedClips.reduce((acc, c) => acc + c.duration, 0).toFixed(1)}s
                      </span>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-400">Final Video Duration (s)</label>
                        <input
                          type="number"
                          min="1"
                          className="w-20 px-2 py-1 rounded-lg bg-slate-900 text-white text-sm border border-white/5"
                          value={finalDuration}
                          onChange={(e) => setFinalDuration(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Draggable ordered list placeholder - using simple ordered list for now */}
                  <div className="space-y-3">
                    {selectedClips.map((clip, idx) => (
                      <div 
                        key={clip.id} 
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragEnter={(e) => handleDragEnter(e, idx)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                        className={`flex items-center gap-4 p-3 rounded-xl border transition-all cursor-move ${draggedItemIndex === idx ? 'bg-primary-900/40 border-primary-500/50 scale-105 shadow-xl' : 'bg-slate-950/60 border-white/5 hover:border-white/10'}`}
                      >
                        <div className="w-6 h-6 flex items-center justify-center bg-slate-900 rounded-full text-xs font-bold text-slate-400 shrink-0">
                          {idx + 1}
                        </div>
                        {clip.parentThumbnail && (
                          <img src={clip.parentThumbnail} alt="Thumb" className="w-12 h-16 object-cover rounded opacity-80 pointer-events-none" />
                        )}
                        <div className="flex-1 pointer-events-none">
                          <p className="text-xs font-bold text-white mb-0.5">Segment #{clip.id}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{clip.start}s - {clip.end}s • {clip.duration}s</p>
                        </div>
                        <button 
                          onClick={() => setSelectedClips(prev => prev.filter(c => c.id !== clip.id))}
                          className="p-1.5 hover:bg-red-500/20 hover:text-red-400 text-slate-500 rounded-lg transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleMerge}
                    disabled={isMerging || selectedClips.length === 0}
                    className="glow-btn w-full mt-6 flex items-center justify-center gap-3 py-4 bg-gradient-to-r from-accent-600 to-primary-600 hover:from-accent-500 hover:to-primary-500 text-white rounded-2xl font-extrabold shadow-lg shadow-accent-950/20 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {isMerging ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Merging Final Video...
                      </>
                    ) : (
                      <>
                        <Layers className="w-5 h-5 text-yellow-300" />
                        Generate Final Video
                      </>
                    )}
                  </button>
                </div>

                {/* Merge Result Preview */}
                <div className="glass-panel rounded-3xl p-6 border border-white/5 flex flex-col items-center justify-center min-h-[400px]">
                  {mergedVideoUrl ? (
                    <div className="w-full flex flex-col items-center gap-4">
                      <h3 className="text-sm font-bold text-green-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5" />
                        Merge Complete
                      </h3>
                      <div className="relative w-full max-w-[220px] aspect-[9/16] bg-black rounded-2xl overflow-hidden border-2 border-slate-800 shadow-xl">
                        <video src={`${BACKEND_URL}${mergedVideoUrl}`} controls className="w-full h-full object-cover" />
                      </div>
                      <a
                        href={`${BACKEND_URL}${mergedVideoUrl}`}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl shadow-lg transition-all"
                      >
                        <Download className="w-5 h-5" />
                        Download 1-Min Short
                      </a>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Monitor className="w-12 h-12 text-slate-700 mx-auto mb-4 opacity-50" />
                      <p className="text-sm text-slate-500 font-medium">Your merged 1-minute video will appear here.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      {/* 9:16 Vertical Smartphone Video Preview Overlay */}
      <AnimatePresence>
        {previewClip && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          >
            {/* Close trigger on outer background click */}
            <div className="absolute inset-0 cursor-default" onClick={() => setPreviewClip(null)} />
            
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="relative w-full max-w-[340px] aspect-[9/18] bg-slate-950 rounded-[40px] border-[8px] border-slate-800 shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Smartphone Camera Notch */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-4 bg-slate-800 rounded-full z-30 flex items-center justify-center">
                <div className="w-2.5 h-2.5 bg-black rounded-full ml-auto mr-4" />
              </div>

              {/* Video Element Wrapper */}
              <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
                <video
                  src={`${BACKEND_URL}${previewClip.url}`}
                  controls
                  autoPlay
                  loop
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Header Info inside Phone */}
              <div className="absolute top-8 left-4 right-4 z-20 flex justify-between items-start pointer-events-none">
                <div className="bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/10 flex flex-col gap-0.5">
                  <span className="text-[8px] text-slate-400 font-extrabold uppercase">SCALE & PAD PREVIEW</span>
                  <span className="text-[10px] text-white font-bold">{previewClip.resolution || '1080x1920'} • {previewClip.duration}s</span>
                </div>
                <button
                  onClick={() => setPreviewClip(null)}
                  className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full border border-white/10 backdrop-blur-sm pointer-events-auto cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Bottom Actions inside Phone */}
              <div className="absolute bottom-4 left-4 right-4 z-20 flex gap-2">
                <a
                  href={`${BACKEND_URL}${previewClip.url}`}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-black/40 transition-all pointer-events-auto"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Clip
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
