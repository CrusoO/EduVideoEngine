/** Exact duration of a PCM WAV file, read from its header: frames / sample rate, rounded to a whole millisecond. */
export type WavInfo = { sampleRate: number; channels: number; bitsPerSample: number; frames: number; durationMs: number };

export function wavInfo(bytes: Uint8Array): WavInfo {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (bytes.byteLength < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a WAV file");
  let fmt: { channels: number; rate: number; bits: number; format: number } | null = null;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = tag(offset);
    const size = v.getUint32(offset + 4, true);
    if (id === "fmt ") fmt = { format: v.getUint16(offset + 8, true), channels: v.getUint16(offset + 10, true), rate: v.getUint32(offset + 12, true), bits: v.getUint16(offset + 22, true) };
    if (id === "data") {
      if (!fmt) throw new Error("WAV data before fmt");
      if (fmt.format !== 1) throw new Error("only PCM WAV is supported");
      // A streamed file may carry a placeholder size: use the bytes that are actually there.
      const dataBytes = Math.min(size, bytes.byteLength - offset - 8);
      const frames = Math.floor(dataBytes / (fmt.channels * (fmt.bits / 8)));
      if (frames === 0) throw new Error("WAV has no samples");
      return { sampleRate: fmt.rate, channels: fmt.channels, bitsPerSample: fmt.bits, frames, durationMs: Math.round((frames * 1000) / fmt.rate) };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}
