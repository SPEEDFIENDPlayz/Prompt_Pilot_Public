export async function blobTo16kMono(blob: Blob): Promise<Float32Array> {
  const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) throw new Error("Audio decoding is not supported in this browser.");
  const context = new AudioContextConstructor();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const data = decoded.getChannelData(channel);
      for (let index = 0; index < decoded.length; index++) mono[index] += data[index] / decoded.numberOfChannels;
    }
    if (decoded.sampleRate === 16000) return mono;
    const targetLength = Math.max(1, Math.round(decoded.length * 16000 / decoded.sampleRate));
    const output = new Float32Array(targetLength);
    const ratio = decoded.sampleRate / 16000;
    for (let index = 0; index < targetLength; index++) {
      const position = index * ratio;
      const left = Math.floor(position);
      const right = Math.min(left + 1, mono.length - 1);
      output[index] = mono[left] * (1 - (position - left)) + mono[right] * (position - left);
    }
    return output;
  } finally { await context.close(); }
}
