import { describe, expect, it } from "vitest";
import { AudioClock, type ClockContext, type ClockSource } from "../src";

class FakeSource implements ClockSource {
  buffer: unknown;
  started?: { when: number; offset: number };
  stopped = false;
  connect() {
    return undefined;
  }
  start(when: number, offset: number) {
    this.started = { when, offset };
  }
  stop() {
    this.stopped = true;
  }
}
class FakeCtx implements ClockContext {
  currentTime = 10; // seconds; an audio context never starts at zero
  state = "suspended";
  outputLatency?: number;
  baseLatency?: number;
  destination = {};
  created: FakeSource[] = [];
  async resume() {
    this.state = "running";
  }
  createBufferSource() {
    const s = new FakeSource();
    this.created.push(s);
    return s;
  }
}
const audio = [
  { sentenceId: "a", startMs: 0, endMs: 2000, trackHash: "h" },
  { sentenceId: "b", startMs: 2300, endMs: 5000, trackHash: "h" },
  { sentenceId: "c", startMs: 5300, endMs: 8000, trackHash: "h" },
];
const buffers = new Map([["a", {}], ["b", {}], ["c", {}]]);
const mk = (over: { latency?: number } = {}) => {
  const ctx = new FakeCtx();
  if (over.latency !== undefined) ctx.outputLatency = over.latency;
  return { ctx, clock: new AudioClock(ctx, { audio, totalMs: 8700 }, buffers, { leadS: 0.05, compensateLatency: true }) };
};

describe("AudioClock", () => {
  it("is parked at zero and not playing; it resumes a suspended context (autoplay policy) on play", async () => {
    const { ctx, clock } = mk();
    expect(clock.nowMs()).toBe(0);
    expect(clock.isPlaying()).toBe(false);
    await clock.play();
    expect(ctx.state).toBe("running");
    expect(clock.isPlaying()).toBe(true);
  });

  it("lesson time is derived from the audio context clock, exactly, after any wait", async () => {
    const { ctx, clock } = mk();
    await clock.play();
    ctx.currentTime += 0.05; // the lead
    expect(clock.nowMs()).toBeCloseTo(0, 6);
    ctx.currentTime += 1.234;
    expect(clock.nowMs()).toBeCloseTo(1234, 6);
    // an hour with no frame ever asked: no drift, because nothing was accumulated
    ctx.currentTime += 3600 - 1.234;
    expect(clock.nowMs()).toBe(8700); // clamped at the end of the lesson
  });

  it("does not run backwards or ahead during the lead-in", async () => {
    const { ctx, clock } = mk();
    await clock.play();
    ctx.currentTime += 0.01;
    expect(clock.nowMs()).toBe(0);
  });

  it("schedules every sentence at a sample-accurate context time", async () => {
    const { ctx, clock } = mk();
    await clock.play();
    const t0 = 10.05;
    expect(ctx.created.map((s) => s.started)).toEqual([
      { when: t0 + 0, offset: 0 },
      { when: t0 + 2.3, offset: 0 },
      { when: t0 + 5.3, offset: 0 },
    ]);
  });

  it("pause freezes the position and stops the audio; play resumes from the frozen position", async () => {
    const { ctx, clock } = mk();
    await clock.play();
    ctx.currentTime += 0.05 + 3.1;
    clock.pause();
    const frozen = clock.nowMs();
    expect(frozen).toBeCloseTo(3100, 6);
    expect(ctx.created.every((s) => s.stopped)).toBe(true);
    ctx.currentTime += 50;
    expect(clock.nowMs()).toBe(frozen);
    ctx.created.length = 0;
    await clock.play();
    // sentence a is over; b is 800 ms in; c starts later
    expect(ctx.created.map((s) => s.started)).toEqual([
      { when: ctx.currentTime + 0.05, offset: expect.closeTo(0.8, 6) },
      { when: expect.closeTo(ctx.currentTime + 0.05 + 2.2, 6), offset: 0 },
    ]);
  });

  it("seek moves the position (rounded to a millisecond) and, while playing, reschedules from there", async () => {
    const { ctx, clock } = mk();
    await clock.play();
    ctx.created.length = 0;
    clock.seek(5600.4);
    expect(clock.nowMs()).toBe(5600);
    expect(clock.isPlaying()).toBe(true);
    expect(ctx.created).toHaveLength(1); // only sentence c is left
    expect(ctx.created[0]!.started!.offset).toBeCloseTo(0.3, 6);
    clock.seek(-5);
    expect(clock.nowMs()).toBe(0);
    clock.seek(1e9);
    expect(clock.nowMs()).toBe(8700);
  });

  it("seeking while paused does not start audio", () => {
    const { ctx, clock } = mk();
    clock.seek(4000);
    expect(clock.nowMs()).toBe(4000);
    expect(ctx.created).toHaveLength(0);
  });

  it("shifts visuals by the output latency the browser reports, never before the anchor", async () => {
    const { ctx, clock } = mk({ latency: 0.12 });
    await clock.play();
    ctx.currentTime += 0.05 + 1;
    expect(clock.rawMs()).toBeCloseTo(1000, 6);
    expect(clock.nowMs()).toBeCloseTo(880, 6);
    expect(clock.latencyMs()).toBeCloseTo(120, 6);
    const off = new AudioClock(ctx, { audio, totalMs: 8700 }, buffers, { compensateLatency: false });
    expect(off.latencyMs()).toBe(0);
  });

  it("a sentence without a buffer is skipped, not fatal", async () => {
    const ctx = new FakeCtx();
    const clock = new AudioClock(ctx, { audio, totalMs: 8700 }, new Map([["a", {}]]));
    await clock.play();
    expect(ctx.created).toHaveLength(1);
  });
});
