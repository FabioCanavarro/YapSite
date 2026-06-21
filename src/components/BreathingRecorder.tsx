"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, X, AlertTriangle, Radio, Upload } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { saveOfflineJournal } from "@/utils/indexedDb";
import { compressAudioFile } from "@/utils/audioCompressor";

interface BreathingRecorderProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BreathingRecorder({ isOpen, onClose, onSuccess }: BreathingRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

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
        // Since we record at 32kbps, the file is already highly compressed.
        // We upload it directly to bypass Vercel limits and prevent WAV inflation.
        await handleSave(audioBlob, options.mimeType || "audio/webm");
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

  // Save/Upload audio process
  const handleSave = async (blob: Blob, mimeType: string) => {
    setIsUploading(true);
    const isOnline = navigator.onLine;

    if (!isOnline) {
      // Offline mode
      try {
        await saveOfflineJournal(blob, mimeType);
        toast.success("Journal saved offline! It will sync automatically when network returns.");
        onSuccess();
        onClose();
      } catch (err) {
        console.error("IndexedDB error:", err);
        toast.error("Failed to save recording offline.");
      } finally {
        setIsUploading(false);
      }
      return;
    }

    // Online mode: upload directly to Supabase
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        // Fallback: Save offline if not logged in
        toast.warning("Sign in required. Saving recording offline.");
        await saveOfflineJournal(blob, mimeType);
        onSuccess();
        onClose();
        return;
      }

      toast.info("Uploading audio journal...", { id: "uploading" });

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
      const fileName = `${user.id}/${Date.now()}-entry.${extension}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("audio_journals")
        .upload(fileName, blob, {
          contentType: mimeType,
          duplex: "half",
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      toast.loading("Processing tone & mood color with AI...", { id: "uploading" });

      const { data: urlData } = supabase.storage
        .from("audio_journals")
        .getPublicUrl(fileName);

      // Create record
      const { data: dbData, error: dbError } = await supabase
        .from("journal_logs")
        .insert({
          user_id: user.id,
          audio_url: urlData.publicUrl,
          processing_status: "pending",
          ai_title: "Processing voice entry...",
          ai_mood_color: "#313244",
          raw_transcript: "Ingesting voice stream...",
          tidied_log: "Awaiting AI analysis...",
          ai_tags: ["Analyzing"],
          custom_tags: [],
        })
        .select()
        .single();

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      // Process API call (Next.js server route calls AI)
      const processRes = await fetch("/api/process-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId: dbData.id, removeFillerWords: true }),
      });

      if (!processRes.ok) {
        throw new Error("Failed to process journal log");
      }

      const processedLog = await processRes.json();
      toast.success("Successfully processed voice journal!", { id: "uploading" });
      
      onSuccess();
      onClose();

    } catch (err: any) {
      console.error("Processing audio error:", err);
      toast.error(`Error saving voice journal: ${err.message || err}`, { id: "uploading" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Set limit to 2GB (2048 MB)
    const MAX_SIZE = 2 * 1024 * 1024 * 1024; 
    if (file.size > MAX_SIZE) {
      toast.error("Audio file is too large. Maximum size is 2GB.");
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      toast.warning("File size is larger than 25MB. Note that processing very large files may require upgrading your Supabase storage limits and can hit Vercel's serverless function timeout limits.", {
        duration: 8000
      });
    }

    toast.loading("Compressing and downsampling audio...", { id: "uploading" });
    const compressedBlob = await compressAudioFile(file);
    
    if (compressedBlob.size > 50 * 1024 * 1024) {
      toast.dismiss("uploading");
      toast.error("Even after compression, the audio file exceeds Supabase's 50MB limit.");
      return;
    }
    
    toast.success(`Audio compressed successfully! (${(compressedBlob.size / 1024 / 1024).toFixed(1)}MB)`);
    await handleSave(compressedBlob, "audio/wav");
  };

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

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
            <button
              onClick={onClose}
              disabled={isUploading}
              className="p-2 rounded-full bg-surface text-text hover:text-stressed transition-colors duration-200"
            >
              <X className="w-5 h-5" />
            </button>
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
                : "Record live or choose a pre-recorded file from your device below."}
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

          {/* Uploading overlay */}
          {isUploading && (
            <div className="absolute inset-0 bg-crust/90 z-50 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-hype border-t-transparent rounded-full animate-spin" />
              <p className="text-hype text-md font-medium tracking-wide">Syncing with cloud...</p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
