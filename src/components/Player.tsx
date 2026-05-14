import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Maximize, Minimize, Volume2, VolumeX, Play, Pause, Circle, Square, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PlayerProps {
  url: string;
  onRecordStart?: () => void;
  onRecordStop?: (blob: Blob) => void;
  adOverlayUrl?: string;
  showAd?: boolean;
  onAdClose?: () => void;
}

export const Player: React.FC<PlayerProps> = ({ 
  url, 
  onRecordStart, 
  onRecordStop,
  adOverlayUrl,
  showAd,
  onAdClose
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFull = !!(document.fullscreenElement || (document as any).webkitFullscreenElement || (document as any).mozFullScreenElement || (document as any).msFullscreenElement);
      setIsFullscreen(isFull);
      
      // Attempt to lock orientation to landscape on mobile when fullscreen
      if (isFull && window.screen && window.screen.orientation && 'lock' in window.screen.orientation) {
        try {
          (window.screen.orientation as any).lock('landscape').catch((err: any) => {
            console.warn('Orientation lock failed:', err);
          });
        } catch (e) {
          console.warn('Orientation lock error:', e);
        }
      } else if (!isFull && window.screen && window.screen.orientation && 'unlock' in window.screen.orientation) {
        try {
          window.screen.orientation.unlock();
        } catch (e) {}
      }
    };

    const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'msfullscreenchange'];
    events.forEach(event => document.addEventListener(event, handleFullscreenChange));
    
    resetControlsTimeout();
    return () => {
      events.forEach(event => document.removeEventListener(event, handleFullscreenChange));
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  const handleContainerClick = () => {
    resetControlsTimeout();
  };

  useEffect(() => {
    if (!videoRef.current || !url) return;

    let hls: Hls | null = null;
    const video = videoRef.current;

    const handleLoadedMetadata = () => {
      video.play().catch(error => {
        if (error.name !== 'AbortError') console.error('Playback error:', error);
      });
      setIsPlaying(true);
    };

    if (Hls.isSupported()) {
      hls = new Hls({
        capLevelToPlayerSize: true,
        enableWorker: true,
        maxBufferSize: 30 * 1000 * 1000, // 30MB
        maxBufferLength: 30,
        startLevel: -1,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 5,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 4,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 6,
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(error => {
          if (error.name !== 'AbortError') console.error('Playback error:', error);
        });
        setIsPlaying(true);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls?.recoverMediaError();
              break;
            default:
              hls?.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.pause();
      video.src = '';
      video.load();
    };
  }, [url]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().catch(error => {
          if (error.name !== 'AbortError') console.error('Playback error:', error);
        });
        setIsPlaying(true);
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleRecording = () => {
    if (!isRecording) {
      if (!videoRef.current) return;
      
      const stream = (videoRef.current as any).captureStream ? (videoRef.current as any).captureStream() : null;
      if (!stream) {
        alert("Recording not supported in this browser version.");
        return;
      }

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        onRecordStop?.(blob);
      };

      recorder.start();
      setIsRecording(true);
      onRecordStart?.();
    } else {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    }
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;

    const doc = document as any;
    const container = containerRef.current as any;

    if (!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement)) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      } else if (container.mozRequestFullScreen) {
        container.mozRequestFullScreen();
      } else if (container.msRequestFullscreen) {
        container.msRequestFullscreen();
      }
    } else {
      if (doc.exitFullscreen) {
        doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      } else if (doc.mozCancelFullScreen) {
        doc.mozCancelFullScreen();
      } else if (doc.msExitFullscreen) {
        doc.msExitFullscreen();
      }
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`relative group bg-black overflow-hidden shadow-2xl border border-slate-700 select-none ${isFullscreen ? 'w-screen h-screen' : 'aspect-video rounded-2xl'}`}
      onClick={handleContainerClick}
      onMouseMove={resetControlsTimeout}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain pointer-events-none"
        playsInline
      />
      
      <div className={`absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent transition-opacity flex flex-col justify-end p-4 md:p-8 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center justify-between gap-2 md:gap-4">
          <div className="flex items-center gap-3 md:gap-6">
            <button
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-10 h-10 md:w-12 md:h-12 bg-white/10 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-white hover:scale-105 transition-transform"
            >
              {isPlaying ? <Pause size={20} fill="white" className="md:w-6 md:h-6" /> : <Play size={20} fill="white" className="md:w-6 md:h-6" />}
            </button>
            
            <div className="flex items-center gap-2 md:gap-3 group/volume">
              <button
                onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                className="p-1.5 md:p-2 text-slate-400 hover:text-white transition-colors"
              >
                {isMuted ? <VolumeX size={18} className="md:w-5 md:h-5" /> : <Volume2 size={18} className="md:w-5 md:h-5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                aria-label="Volume"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setVolume(val);
                  if (videoRef.current) videoRef.current.volume = val;
                }}
                className="w-16 md:w-24 accent-blue-600 appearance-none bg-slate-700 h-1 rounded-full cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={(e) => { e.stopPropagation(); handleRecording(); }}
              aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
              className={`flex items-center gap-2 px-3 py-1.5 md:px-5 md:py-2.5 rounded-lg font-bold text-[10px] md:text-sm shadow-lg transition-all ${
                isRecording 
                ? 'bg-red-600 text-white animate-pulse shadow-red-600/20' 
                : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-md border border-white/10'
              }`}
            >
              <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${isRecording ? 'bg-white' : 'bg-red-600'}`} />
              <span className="hidden xs:inline">{isRecording ? 'STOP' : 'RECORD'}</span>
              <span className="xs:hidden">{isRecording ? <Square size={12} fill="white" /> : <Circle size={12} fill="white" />}</span>
            </button>
            
            <button
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              className="p-1.5 md:p-2 text-slate-400 hover:text-white transition-colors"
            >
              {isFullscreen ? <Minimize size={18} className="md:w-5 md:h-5" /> : <Maximize size={18} className="md:w-5 md:h-5" />}
            </button>
          </div>
        </div>
      </div>

      <div className="absolute top-4 left-4 flex gap-2">
        <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Live</span>
        <span className="bg-black/60 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-0.5 rounded uppercase tracking-wider">HD 1080p</span>
      </div>

      <AnimatePresence>
        {showAd && adOverlayUrl && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl bg-black/80 backdrop-blur-md border border-slate-700 p-2 rounded-lg z-20 flex items-center gap-4"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sponsored</span>
                <button onClick={onAdClose} className="p-1 hover:bg-slate-800 rounded">
                  <X size={14} className="text-slate-400" />
                </button>
              </div>
              {adOverlayUrl.startsWith('http') && adOverlayUrl.match(/\.(jpeg|jpg|gif|png)$/) ? (
                <img src={adOverlayUrl} alt="Ad" className="w-full h-12 object-cover rounded" />
              ) : (
                <div className="bg-white/5 p-2 rounded flex items-center justify-between">
                  <p className="text-xs text-white font-medium truncate">{adOverlayUrl}</p>
                  <a href="#" className="text-xs text-blue-400 font-bold hover:underline ml-4">Learn More</a>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {isRecording && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute top-6 right-6 flex items-center gap-2 bg-red-600/90 text-white px-3 py-1 rounded-sm text-xs font-mono tracking-widest uppercase italic"
          >
            <div className="w-2 h-2 rounded-full bg-white animate-ping" />
            Live Recording
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
