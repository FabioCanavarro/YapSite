/**
 * Decodes and downsamples an audio file to 16kHz mono WAV format in the browser.
 * This yields high-fidelity speech quality while reducing file sizes by 6x to 12x.
 */
export async function compressAudioFile(file: Blob): Promise<Blob> {
  if (typeof window === "undefined") {
    return file;
  }

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    
    // 1. ArrayBuffer load and decode
    const arrayBuffer = await file.arrayBuffer();
    const originalBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    // Configure downsampling values
    const TARGET_SAMPLE_RATE = 16000; // 16kHz is ideal for voice AI
    const TARGET_CHANNELS = 1;        // Mono
    
    const targetLength = Math.floor(originalBuffer.duration * TARGET_SAMPLE_RATE);
    
    // 2. Offline audio context render
    const offlineCtx = new OfflineAudioContext(
      TARGET_CHANNELS,
      targetLength,
      TARGET_SAMPLE_RATE
    );
    
    const sourceNode = offlineCtx.createBufferSource();
    sourceNode.buffer = originalBuffer;
    sourceNode.connect(offlineCtx.destination);
    sourceNode.start();
    
    const renderedBuffer = await offlineCtx.startRendering();
    
    // 3. Encode AudioBuffer to WAV format
    return audioBufferToWav(renderedBuffer);
  } catch (err) {
    console.error("Client-side audio compression failed, returning original file:", err);
    return file;
  }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // 1 = Raw PCM 16-bit signed integer
  const bitDepth = 16;
  
  const resultLength = buffer.length * numOfChan * 2 + 44; // 44 bytes header
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
      
      // Convert Float32 sample to Int16 PCM sample
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, intSample, true);
      pos += 2;
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
