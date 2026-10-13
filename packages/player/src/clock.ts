import type { Timeline } from "@eve/schema";

/**
 * The lesson clock. Visual time is DERIVED from it on every frame, never accumulated from frame deltas
 * (requestAnimationFrame callbacks are late, skipped in background tabs and jittery; adding them up drifts).
 */
export interface MasterClock {
  /** Lesson time in milliseconds, as the student hears it now. */
  nowMs(): number;
  isPlaying(): boolean;
  /** Starts (or resumes) from the current position. Resolves once the audio device is running. */
  play(): Promise<void>;
  pause(): void;
  seek(ms: number): void;
}

/** The slice of Web Audio the clock uses, so a test can drive it with a fake. */
export interface ClockContext {
  readonly currentTime: number; // seconds, the audio hardware clock
  readonly state: string;
  readonly outputLatency?: number; // seconds, where the browser reports it
  readonly baseLatency?: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  createBufferSource(): ClockSource;
}
export interface ClockSource {
  buffer: unknown;
  connect(destination: unknown): unknown;
  start(when: number, offset: number): void;
  stop(): void;
}

export type AudioClockOptions = {
  /** Seconds between asking for playback and the first sample, so scheduling is never in the past. */
  leadS?: number;
  /** Shift visuals later by the output latency the browser reports, so they match what is heard. Bluetooth latency is not reported to the page. */
  compensateLatency?: boolean;
};

/**
 * Master clock = the audio context's own clock (`currentTime`, the audio hardware clock). Each sentence's audio is
 * scheduled at a sample-accurate context time; lesson time is `anchorLesson + (currentTime - anchorCtx)`, re-anchored
 * only on play, seek and pause (never per frame). So after an hour the visuals are exactly as far from the audio as at
 * the first second, whatever the frame rate did.
 */
export class AudioClock implements MasterClock {
  private anchorCtx = 0;
  private anchorLesson = 0;
  private playing = false;
  private sources: ClockSource[] = [];
  private readonly lead: number;
  private readonly compensate: boolean;

  constructor(
    private readonly ctx: ClockContext,
    private readonly timeline: Pick<Timeline, "audio" | "totalMs">,
    private readonly buffers: ReadonlyMap<string, unknown>,
    opts: AudioClockOptions = {},
  ) {
    this.lead = opts.leadS ?? 0.05;
    this.compensate = opts.compensateLatency ?? true;
  }

  /** Output latency in ms that the browser reports (0 if it does not). */
  latencyMs(): number {
    return this.compensate ? Math.max(0, (this.ctx.outputLatency ?? this.ctx.baseLatency ?? 0) * 1000) : 0;
  }

  /** Where the audio clock says the lesson is, before latency compensation. */
  rawMs(): number {
    if (!this.playing) return this.anchorLesson;
    return Math.max(this.anchorLesson, this.anchorLesson + (this.ctx.currentTime - this.anchorCtx) * 1000);
  }

  nowMs(): number {
    if (!this.playing) return this.anchorLesson;
    return Math.min(this.timeline.totalMs, Math.max(this.anchorLesson, this.rawMs() - this.latencyMs()));
  }

  isPlaying(): boolean {
    return this.playing;
  }

  async play(): Promise<void> {
    if (this.playing) return;
    if (this.ctx.state !== "running") await this.ctx.resume();
    this.schedule();
    this.playing = true;
  }

  pause(): void {
    if (!this.playing) return;
    this.anchorLesson = this.nowMs();
    this.stopSources();
    this.playing = false;
  }

  seek(ms: number): void {
    const t = Math.min(this.timeline.totalMs, Math.max(0, Math.round(ms)));
    const was = this.playing;
    this.stopSources();
    this.anchorLesson = t;
    this.playing = false;
    if (was) {
      this.schedule();
      this.playing = true;
    }
  }

  private schedule(): void {
    this.anchorCtx = this.ctx.currentTime + this.lead;
    for (const a of this.timeline.audio) {
      if (a.endMs <= this.anchorLesson) continue;
      const buffer = this.buffers.get(a.sentenceId);
      if (!buffer) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.ctx.destination);
      const into = Math.max(0, this.anchorLesson - a.startMs); // already inside this sentence
      src.start(this.anchorCtx + Math.max(0, a.startMs - this.anchorLesson) / 1000, into / 1000);
      this.sources.push(src);
    }
  }

  private stopSources(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* a source that already ended */
      }
    }
    this.sources = [];
  }
}
