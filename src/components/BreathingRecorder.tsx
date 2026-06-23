"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, X, AlertTriangle, Radio, Upload, Minimize2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { saveOfflineJournal } from "@/utils/indexedDb";
import { compressAudioFile } from "@/utils/audioCompressor";

interface QueueItem {
  name: string;
  size: number;
  status: 'compressing' | 'uploading' | 'saving' | 'completed' | 'failed';
  progress: number;
  lastModified: number;
}

interface BreathingRecorderProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  removeFillerWords: boolean;
  enableSwearWords: boolean;
  customPrompt: string;
  language: string;
  customMoods: { name: string; color: string }[];
  categoriesConfig: { mode: "open" | "flexible" | "strict"; list: string[] };
  tagsConfig: { mode: "open" | "flexible" | "strict"; list: string[] };
  onRegisterTags: (category: string, tags: string[]) => void;
}

export default function BreathingRecorder({ 
  isOpen, 
  onClose, 
  onSuccess,
  removeFillerWords,
  enableSwearWords,
  customPrompt,
  language,
  customMoods,
  categoriesConfig,
  tagsConfig,
  onRegisterTags
}: BreathingRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(-1);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Start recording voice
  const startRecording = async () => {
    chunksRef.current = [];
    setDuration(0);
    setVolume(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Detect audio format compatibility and set 32kbps bitrate for compact file size
      let options: MediaRecorderOptions = { mimeType: "audio/webm", audioBitsPerSecond: 32000 };
      if (!MediaRecorder.isTypeSupported("audio/webm")) {
        options = { mimeType: "audio/ogg", audioBitsPerSecond: 32000 };
        if (!MediaRecorder.isTypeSupported("audio/ogg")) {
          options = { mimeType: "audio/mp4", audioBitsPerSecond: 32000 };
        }
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: options.mimeType });
        setIsUploading(true);
        setIsMinimized(false);
        setQueue([{
          name: "Live Audio Recording",
          size: audioBlob.size,
          status: 'uploading',
          progress: 0,
          lastModified: Date.now()
        }]);
        setCurrentQueueIndex(0);
        
        try {
          await handleSaveQueueItem(audioBlob, options.mimeType || "audio/webm", "Live Audio Recording", audioBlob.size, Date.now());
          setQueue(prev => prev.map((item, idx) => idx === 0 ? { ...item, status: 'completed' } : item));
          
          const formattedSize = audioBlob.size > 1024 * 1024
            ? `${(audioBlob.size / (1024 * 1024)).toFixed(1)} MB`
            : `${(audioBlob.size / 1024).toFixed(0)} KB`;
          
          toast.success(`Recording saved successfully! (${formattedSize}) AI analysis running in background.`);
          onSuccess();
          onClose();
        } catch (err: any) {
          console.error("Live recording save failed:", err);
          setQueue(prev => prev.map((item, idx) => idx === 0 ? { ...item, status: 'failed' } : item));
          toast.error(`Failed to save recording: ${err.message || err}`);
        } finally {
          setIsUploading(false);
        }
      };

      // Set up Web Audio API to detect microphone volume
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      mediaRecorder.start(250); // read data chunks every 250ms
      setIsRecording(true);
      toast.success("Recording started... Speak naturally.");

      // Volume tracking loop
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        // Normalize volume (0 to 1 scaling range)
        setVolume(Math.min(1, avg / 80));
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // Timer tracker
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.error("Microphone access failed:", err);
      toast.error("Could not access microphone. Please check system permissions.");
      onClose();
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    cleanupAudio();
  };

  const cleanupAudio = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, []);

  const updateQueueItemStatus = (index: number, status: QueueItem['status']) => {
    setQueue((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, status } : item))
    );
  };

  const handleSaveQueueItem = async (
    blob: Blob,
    mimeType: string,
    fileNameOrig: string,
    size: number,
    lastModified: number
  ) => {
    const isOnline = navigator.onLine;

    if (!isOnline) {
      try {
        await saveOfflineJournal(blob, mimeType);
        toast.success(`Journal "${fileNameOrig}" saved offline! It will sync automatically when network returns.`);
        return;
      } catch (err) {
        console.error("IndexedDB error:", err);
        throw new Error("Failed to save recording offline.");
      }
    }

    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      toast.warning("Sign in required. Saving recording offline.");
      await saveOfflineJournal(blob, mimeType);
      return;
    }

    let extension = "wav";
    if (mimeType.includes("webm")) {
      extension = "webm";
    } else if (mimeType.includes("ogg")) {
      extension = "ogg";
    } else if (mimeType.includes("mp4") || mimeType.includes("m4a") || mimeType.includes("aac")) {
      extension = "m4a";
    } else {
      const parsedExt = mimeType.split("/")[1];
      extension = parsedExt ? parsedExt.split(";")[0] : "wav";
    }

    const fileTimestamp = lastModified || Date.now();
    const fileName = `${user.id}/${fileTimestamp}-${Math.random().toString(36).substring(7)}.${extension}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("audio_journals")
      .upload(fileName, blob, {
        contentType: mimeType,
        duplex: "half",
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage
      .from("audio_journals")
      .getPublicUrl(fileName);

    const sizeTag = `_filesize:${size}`;
    const customTags = [sizeTag];

    const categories = categoriesConfig;
    const tags = tagsConfig;

    const { data: dbData, error: dbError } = await supabase
      .from("journal_logs")
      .insert({
        user_id: user.id,
        audio_url: urlData.publicUrl,
        processing_status: "pending",
        ai_title: `Analyzing "${fileNameOrig.substring(0, 30)}"...`,
        ai_mood_color: "#313244",
        raw_transcript: "Ingesting voice stream...",
        tidied_log: "Awaiting AI analysis...",
        ai_tags: ["Analyzing"],
        custom_tags: customTags,
        created_at: new Date(fileTimestamp).toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }

    fetch("/api/process-audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        logId: dbData.id,
        removeFillerWords,
        enableSwearWords,
        customPrompt,
        language,
        customMoods,
        categories,
        tags,
      }),
    })
      .then(async (res) => {
        if (res.ok) {
          const processedLog = await res.json();
          
          // Auto register spouted category & tags
          if (processedLog) {
            const categoryTag = processedLog.custom_tags?.find((t: string) => t.startsWith("_category:"));
            const categoryName = categoryTag ? categoryTag.replace("_category:", "") : "General";
            onRegisterTags(categoryName, processedLog.ai_tags || []);

            // Write run history log
            try {
              const histSaved = localStorage.getItem("yapsite_analysis_history");
              const hist = histSaved ? JSON.parse(histSaved) : [];
              hist.unshift({
                id: Math.random().toString(36).substring(7),
                timestamp: new Date().toISOString(),
                action: "Recorded Audio Analysis",
                title: processedLog.ai_title || "Untitled Entry",
                status: "success",
              });
              localStorage.setItem("yapsite_analysis_history", JSON.stringify(hist.slice(0, 100)));
            } catch (e) {}
          }

          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification("YapSite Journal Processed", {
              body: `"${processedLog.ai_title || "Untitled"}" is ready!`,
              icon: "/favicon.ico"
            });
          }
          toast.success(`Processed "${processedLog.ai_title}"!`);
          onSuccess();
        } else {
          // Write failed run history log
          try {
            const histSaved = localStorage.getItem("yapsite_analysis_history");
            const hist = histSaved ? JSON.parse(histSaved) : [];
            hist.unshift({
              id: Math.random().toString(36).substring(7),
              timestamp: new Date().toISOString(),
              action: "Recorded Audio Analysis",
              title: fileNameOrig,
              status: "failed",
              error: `Server responded with ${res.status}`,
            });
            localStorage.setItem("yapsite_analysis_history", JSON.stringify(hist.slice(0, 100)));
          } catch (e) {}
        }
      })
      .catch((err) => {
        console.error("Background AI process trigger failed:", err);
        // Write failed run history log
        try {
          if (typeof window !== "undefined") {
            const histSaved = localStorage.getItem("yapsite_analysis_history");
            const hist = histSaved ? JSON.parse(histSaved) : [];
            hist.unshift({
              id: Math.random().toString(36).substring(7),
              timestamp: new Date().toISOString(),
              action: "Recorded Audio Analysis",
              title: fileNameOrig,
              status: "failed",
              error: err.message || String(err),
            });
            localStorage.setItem("yapsite_analysis_history", JSON.stringify(hist.slice(0, 100)));
          }
        } catch (e) {}
      });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);

    const MAX_SIZE = 2 * 1024 * 1024 * 1024;
    const oversized = fileList.some(file => file.size > MAX_SIZE);
    if (oversized) {
      toast.error("One or more audio files are too large. Maximum size is 2GB.");
      return;
    }

    const initialQueue: QueueItem[] = fileList.map(file => ({
      name: file.name,
      size: file.size,
      status: 'compressing',
      progress: 0,
      lastModified: file.lastModified
    }));

    setQueue(initialQueue);
    setIsUploading(true);
    setIsMinimized(false);

    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    for (let i = 0; i < fileList.length; i++) {
      setCurrentQueueIndex(i);
      const file = fileList[i];

      try {
        updateQueueItemStatus(i, 'compressing');
        const compressedBlob = await compressAudioFile(file);

        updateQueueItemStatus(i, 'uploading');
        await handleSaveQueueItem(compressedBlob, compressedBlob.type, file.name, compressedBlob.size, file.lastModified);

        updateQueueItemStatus(i, 'completed');

        const origSizeStr = file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${(file.size / 1024).toFixed(0)} KB`;
          
        const compSizeStr = compressedBlob.size > 1024 * 1024
          ? `${(compressedBlob.size / (1024 * 1024)).toFixed(1)} MB`
          : `${(compressedBlob.size / 1024).toFixed(0)} KB`;

        if (compressedBlob.size < file.size) {
          toast.success(`"${file.name}" uploaded successfully! Compressed to ${compSizeStr} (was ${origSizeStr}).`);
        } else {
          toast.success(`"${file.name}" uploaded successfully! (${compSizeStr})`);
        }
      } catch (err: any) {
        console.error("Queue item upload failed:", err);
        updateQueueItemStatus(i, 'failed');
        toast.error(`Failed to upload ${file.name}: ${err.message || err}`);
      }
    }

    setIsUploading(false);
    toast.success("All selected audio files have been synced! Processing continues in background.");
    onSuccess();
    onClose();
  };

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (isOpen && isMinimized) {
    const activeItem = queue[currentQueueIndex];
    const completedCount = queue.filter(item => item.status === 'completed').length;
    const totalCount = queue.length;

    return (
      <div className="fixed bottom-6 right-6 z-50 glass-panel p-4 rounded-3xl flex items-center gap-4 shadow-xl border border-hype/20 max-w-sm w-72 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="relative flex items-center justify-center shrink-0">
          <Loader2 className="w-6 h-6 text-hype animate-spin" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-text truncate">Syncing Journal Entries</p>
          <p className="text-[10px] text-overlay truncate">
            {activeItem ? `${activeItem.status === 'compressing' ? 'Compressing' : 'Uploading'} "${activeItem.name}"` : 'Processing...'}
          </p>
          <p className="text-[9px] text-hype/80 font-mono mt-0.5">
            {completedCount} / {totalCount} completed
          </p>
        </div>
        <button
          onClick={() => setIsMinimized(false)}
          className="text-xs font-semibold text-hype hover:text-hype-hover shrink-0 px-2.5 py-1.5 rounded-full bg-crust border border-surface cursor-pointer"
        >
          Expand
        </button>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-crust/95 backdrop-blur-md p-6"
        >
          {/* Top Panel */}
          <div className="w-full flex justify-between items-center max-w-md mt-4">
            <div className="flex items-center gap-2 text-overlay">
              <Radio className={`w-4 h-4 ${isRecording ? "text-stressed animate-pulse" : ""}`} />
              <span className="text-sm font-medium tracking-wide uppercase">
                {isRecording ? "Live Recording" : "Ready to Record"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isUploading && (
                <button
                  onClick={() => setIsMinimized(true)}
                  title="Minimize to background"
                  className="p-2 rounded-full bg-surface text-text hover:text-hype transition-colors duration-200 cursor-pointer"
                >
                  <Minimize2 className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={() => {
                  if (isUploading) {
                    const confirmClose = window.confirm("Active uploads are running. Closing will keep uploads running in the background. Minimize instead?");
                    if (confirmClose) {
                      setIsMinimized(true);
                      return;
                    }
                  }
                  onClose();
                }}
                className="p-2 rounded-full bg-surface text-text hover:text-stressed transition-colors duration-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Center Breathing / Volume Responsive Animation */}
          <div className="flex-1 flex flex-col items-center justify-center relative w-full">
            {/* Ambient background breathing pulse */}
            <div
              className={`absolute w-72 h-72 rounded-full bg-hype/15 blur-3xl transition-transform duration-300 ${
                isRecording ? "" : "breathing-pulse"
              }`}
              style={{
                transform: isRecording ? `scale(${1 + volume * 0.6})` : undefined,
                backgroundColor: isRecording ? `hsl(${260 + volume * 100}, 70%, 70%, 0.2)` : undefined,
              }}
            />

            {/* Circular Breathing Graphic */}
            <motion.div
              animate={isRecording ? {
                scale: 1 + volume * 0.45,
                boxShadow: `0 0 ${40 + volume * 100}px ${10 + volume * 50}px rgba(203, 166, 247, ${0.2 + volume * 0.5})`,
              } : {
                scale: [1, 1.15, 1],
                boxShadow: "0 0 30px 5px rgba(203, 166, 247, 0.15)",
              }}
              transition={isRecording ? { type: "spring", stiffness: 150, damping: 15 } : {
                repeat: Infinity,
                duration: 4,
                ease: "easeInOut",
              }}
              className="w-48 h-48 rounded-full bg-surface border-2 border-hype flex items-center justify-center relative z-10"
            >
              {isRecording ? (
                <Square className="w-16 h-16 text-stressed fill-stressed" />
              ) : (
                <Mic className="w-18 h-18 text-hype" />
              )}
            </motion.div>

            <p className="mt-8 text-overlay text-sm font-light text-center max-w-xs z-10">
              {isRecording
                ? "Recording voice... AI will listen to your pauses, pace, and breathing to detect your mood color."
                : "Record live or choose pre-recorded files from your device below."}
            </p>
          </div>

          {/* Bottom Panel controls */}
          <div className="w-full max-w-md flex flex-col items-center gap-6 mb-8 z-10">
            {/* Timer display */}
            <div className="text-4xl font-mono font-bold tracking-tight text-text">
              {formatTime(duration)}
            </div>

            {/* Large trigger button */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center w-full px-4">
              {!isRecording ? (
                <>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={startRecording}
                    disabled={isUploading}
                    className="px-8 py-4 rounded-3xl bg-hype text-crust font-semibold text-lg flex items-center gap-3 shadow-lg shadow-hype/25 cursor-pointer w-full sm:w-auto justify-center"
                  >
                    <Mic className="w-5 h-5 fill-crust" /> Start Recording
                  </motion.button>

                  <label className="px-6 py-4 rounded-3xl bg-surface hover:bg-surface-hover border border-overlay/10 text-text font-semibold text-md flex items-center gap-3 cursor-pointer transition-colors shadow-md w-full sm:w-auto justify-center">
                    <Upload className="w-5 h-5 text-overlay" />
                    <span>Upload Audio</span>
                    <input
                      type="file"
                      accept="audio/*"
                      multiple
                      onChange={handleFileChange}
                      disabled={isUploading}
                      className="hidden"
                    />
                  </label>
                </>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={stopRecording}
                  disabled={isUploading}
                  className="px-8 py-4 rounded-3xl bg-stressed text-crust font-semibold text-lg flex items-center gap-3 shadow-lg shadow-stressed/25 cursor-pointer w-full justify-center"
                >
                  <Square className="w-5 h-5 fill-crust" /> Finish & Upload
                </motion.button>
              )}
            </div>
          </div>

          {/* In-Dialog Uploading/Compressing Queue progress */}
          {isUploading && (
            <div className="absolute inset-0 bg-crust/90 z-50 flex flex-col items-center justify-center p-6 gap-6">
              <Loader2 className="w-12 h-12 text-hype animate-spin mb-2" />
              <p className="text-hype text-md font-bold tracking-wide">Syncing entries with cloud...</p>
              
              <div className="w-full max-w-md bg-surface rounded-2xl p-4 border border-overlay/10 max-h-60 overflow-y-auto flex flex-col gap-2">
                {queue.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs p-2.5 rounded-xl bg-crust/50 border border-surface">
                    <span className="truncate flex-1 font-medium text-text pr-2">{item.name}</span>
                    <span className={`shrink-0 font-semibold px-2 py-0.5 rounded-lg text-[9px] uppercase font-mono ${
                      item.status === 'completed' ? 'bg-productive/20 text-productive' :
                      item.status === 'failed' ? 'bg-stressed/20 text-stressed' :
                      item.status === 'uploading' ? 'bg-hype/20 text-hype animate-pulse' :
                      item.status === 'compressing' ? 'bg-calm/20 text-calm animate-pulse' :
                      'bg-surface text-overlay'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
              
              <button
                onClick={() => setIsMinimized(true)}
                className="px-6 py-2.5 rounded-full bg-surface hover:bg-surface-hover border border-overlay/10 text-xs font-semibold text-hype transition-all cursor-pointer"
              >
                Minimize & Do in Background
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
