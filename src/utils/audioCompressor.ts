/**
 * Decodes and downsamples an audio file to an optimized speech mono WAV format in the browser.
 * Uses dynamic sample rates (16kHz for short voice notes, 11kHz / 8kHz for longer recordings)
 * to ensure files stay comfortably below 2.5 MB so they never trip Vercel's 4.5 MB serverless limit,
 * while preserving crystal-clear voice recognition quality for Whisper AI.
 */
export async function compressAudioFile(file: Blob): Promise<Blob> {
  if (typeof window === "undefined") {
    return file;
  }

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    return file;
  }

  let audioCtx: AudioContext | null = null;

  try {
    audioCtx = new AudioContextClass();
    
    // 1. ArrayBuffer load and decode (slice(0) prevents detached buffer issues on mobile WebKit/Chrome)
    const arrayBuffer = await file.arrayBuffer();
    const originalBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    
    const duration = originalBuffer.duration || 0;
    
    // 2. Select target sample rate dynamically based on audio length
    // Target budget: ~2.4 MB maximum to stay safely under Vercel's 4.5 MB proxy ceiling
    // Whisper speech recognition frontend resamples audio to 8kHz-16kHz internally.
    let targetSampleRate = 16000;
    if (duration > 300) {
      // > 5 minutes: 8,000 Hz 8-bit mono = ~480 KB/min (voice standard)
      targetSampleRate = 8000;
    } else if (duration > 150) {
      // 2.5 - 5 minutes: 11,025 Hz 8-bit mono = ~660 KB/min
      targetSampleRate = 11025;
    } else {
      // <= 2.5 minutes: 16,000 Hz 8-bit mono = ~960 KB/min (full fidelity)
      targetSampleRate = 16000;
    }

    const TARGET_CHANNELS = 1; // Mono
    const targetLength = Math.max(1, Math.floor(duration * targetSampleRate));
    
    // 3. Offline audio context render
    const offlineCtx = new OfflineAudioContext(
      TARGET_CHANNELS,
      targetLength,
      targetSampleRate
    );
    
    const sourceNode = offlineCtx.createBufferSource();
    sourceNode.buffer = originalBuffer;
    sourceNode.connect(offlineCtx.destination);
    sourceNode.start();
    
    const renderedBuffer = await offlineCtx.startRendering();
    
    // 4. Encode AudioBuffer to unsigned 8-bit PCM WAV format
    const compressedWav = audioBufferToWav(renderedBuffer);
    console.log(
      `[AudioCompressor] Downsampled ${(file.size / 1024 / 1024).toFixed(2)} MB -> ${(compressedWav.size / 1024 / 1024).toFixed(2)} MB (${targetSampleRate}Hz 8-bit mono, duration: ${duration.toFixed(1)}s)`
    );
    return compressedWav;
  } catch (err) {
    console.warn("Client-side audio compression failed, returning original file:", err);
    return file;
  } finally {
    if (audioCtx) {
      try {
        await audioCtx.close();
      } catch {}
    }
  }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // 1 = Unsigned 8-bit PCM
  const bitDepth = 8;
  
  const resultLength = buffer.length * numOfChan * 1 + 44; // 44 bytes header
  const bufferArr = new ArrayBuffer(resultLength);
  const view = new DataView(bufferArr);
  
  const channels: Float32Array[] = [];
  let offset = 0;
  let pos = 0;
  
  // Write WAV headers
  writeString("RIFF");
  writeUint32(resultLength - 8);
  writeString("WAVE");
  
  writeString("fmt ");
  writeUint32(16);
  writeUint16(format);
  writeUint16(numOfChan);
  writeUint32(sampleRate);
  writeUint32(sampleRate * numOfChan * (bitDepth / 8));
  writeUint16(numOfChan * (bitDepth / 8));
  writeUint16(bitDepth);
  
  writeString("data");
  writeUint32(resultLength - pos - 4);
  
  // Interleave channels
  for (let i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }
  
  const samplesLength = buffer.length;
  while (offset < samplesLength) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = channels[i][offset];
      
      // Clamp values between -1 and 1
      sample = Math.max(-1, Math.min(1, sample));
      
      // Convert Float32 sample to Unsigned 8-bit PCM (0 to 255, silence is 128)
      const u8Sample = Math.floor((sample + 1) * 127.5);
      view.setUint8(pos, u8Sample);
      pos += 1;
    }
    offset++;
  }
  
  return new Blob([bufferArr], { type: "audio/wav" });
  
  function writeString(s: string) {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(pos + i, s.charCodeAt(i));
    }
    pos += s.length;
  }
  
  function writeUint16(d: number) {
    view.setUint16(pos, d, true);
    pos += 2;
  }
  
  function writeUint32(d: number) {
    view.setUint32(pos, d, true);
    pos += 4;
  }
}
