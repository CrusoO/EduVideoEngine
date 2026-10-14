import { describe, expect, it } from "vitest";
import { LlmRefused, RateLimiter, estimateRequest, estimateTokens, realClock, type Clock, type ModelProfile } from "../src";

/** A clock that only moves when the limiter sleeps, and remembers every sleep. */
function fakeClock(start = 1_000_000) {
  const sleeps: number[] = [];
  const clock: Clock & { t: number; sleeps: number[] } = {
    t: start,
    sleeps,
    now: () => clock.t,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock.t += ms;
    },
  };
  return clock;
}
const limiter = (clock: Clock, rpm: number, tpm: number | null) => new RateLimiter(clock, "gemini/test", { rpm, tpm });

describe("token estimates", () => {
  it("count three characters to a token, rounded up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abc")).toBe(1);
    expect(estimateTokens("abcd")).toBe(2);
  });
  it("add the output and, for a reasoning model, the expected reasoning", () => {
    const base = { jsonMode: true, maxOutputTokens: 100, limits: { rpm: 1, tpm: 1, rpd: 1 }, verified: false } as unknown as ModelProfile;
    expect(estimateRequest("abc", "abcdef", 10, { ...base, reasoning: false, expectedReasoningTokens: 500 })).toBe(1 + 2 + 10);
    expect(estimateRequest("abc", "abcdef", 10, { ...base, reasoning: true, expectedReasoningTokens: 500 })).toBe(1 + 2 + 10 + 500);
    expect(estimateRequest("abc", "abcdef", 10, { ...base, reasoning: true })).toBe(1 + 2 + 10);
  });
  it("the real clock tells the time and sleeps", async () => {
    const before = realClock.now();
    await realClock.sleep(5);
    expect(realClock.now()).toBeGreaterThanOrEqual(before + 4);
  });
});

describe("failFast", () => {
  it("refuses a request over the per-minute limit, naming the numbers, and allows one exactly at it", () => {
    const l = limiter(fakeClock(), 5, 1000);
    expect(() => l.failFast(1001)).toThrow(LlmRefused);
    expect(() => l.failFast(1001)).toThrow(/1001 tokens.*limit is 1000.*Nothing was sent/s);
    expect(() => l.failFast(1000)).not.toThrow();
  });
  it("has nothing to check when the token limit is unknown", () => {
    expect(() => limiter(fakeClock(), 5, null).failFast(10 ** 9)).not.toThrow();
  });
});

describe("requests per minute", () => {
  it("lets the first request start at once", async () => {
    const c = fakeClock();
    expect(await limiter(c, 5, null).acquire(10)).toBe(0);
    expect(c.sleeps).toEqual([]);
  });
  it("spaces requests by 60 s divided by the limit, rounded up", async () => {
    const c = fakeClock();
    const l = limiter(c, 7, null); // 8572 ms
    await l.acquire(1);
    expect(await l.acquire(1)).toBe(8572);
    expect(c.sleeps).toEqual([8572]);
  });
  it("waits only for what is left of the gap", async () => {
    const c = fakeClock();
    const l = limiter(c, 6, null); // 10 s
    await l.acquire(1);
    c.t += 4000;
    expect(await l.acquire(1)).toBe(6000);
  });
  it("does not wait when the gap has passed or has just passed", async () => {
    const c = fakeClock();
    const l = limiter(c, 6, null);
    await l.acquire(1);
    c.t += 10_000; // exactly the gap: wait would be 0
    expect(await l.acquire(1)).toBe(0);
    c.t += 50_000;
    expect(await l.acquire(1)).toBe(0);
    expect(c.sleeps).toEqual([]);
  });
  it("counts from the latest request the ledger knows about when this process has sent none", async () => {
    const c = fakeClock();
    expect(await limiter(c, 6, null).acquire(1, c.t - 3000)).toBe(7000);
  });
  it("prefers its own latest start to the ledger's", async () => {
    const c = fakeClock();
    const l = limiter(c, 6, null);
    await l.acquire(1);
    c.t += 2000;
    expect(await l.acquire(1, c.t - 60_000)).toBe(8000);
  });
});

describe("tokens per minute", () => {
  it("lets requests through while the window has room", async () => {
    const c = fakeClock();
    const l = limiter(c, 600, 1000); // 100 ms gap
    await l.acquire(400);
    c.t += 100;
    expect(await l.acquire(600)).toBe(0); // 400 + 600 is exactly the limit
  });
  it("waits for the oldest reservation to leave the window when the next would not fit", async () => {
    const c = fakeClock();
    const l = limiter(c, 600, 1000);
    await l.acquire(600);
    c.t += 100;
    await l.acquire(300);
    c.t += 100;
    const waited = await l.acquire(500); // 600 + 300 + 500 > 1000: wait until the first leaves
    expect(waited).toBe(60_000 - 200);
    expect(c.sleeps).toEqual([59_800]);
  });
  it("a reservation older than 60 s no longer counts, and one exactly 60 s old no longer counts either", async () => {
    const c = fakeClock();
    const l = limiter(c, 600, 1000);
    await l.acquire(1000);
    c.t += 59_999;
    expect(await l.acquire(1)).toBe(50); // 1 ms is left in the window; the shortest wait is 50 ms
    const d = fakeClock();
    const m = limiter(d, 600, 1000);
    await m.acquire(1000);
    d.t += 60_000;
    expect(await m.acquire(1000)).toBe(0);
  });
  it("never waits less than 50 ms between checks", async () => {
    const c = fakeClock();
    const l = limiter(c, 600, 1000);
    await l.acquire(1000);
    c.t += 59_990;
    await l.acquire(1);
    expect(c.sleeps.at(-1)).toBe(50);
  });
  it("lets a request through when the window is empty, even one the limit could not fit alongside others", async () => {
    const c = fakeClock();
    expect(await limiter(c, 600, 1000).acquire(5000)).toBe(0); // failFast is the guard for this, not acquire
  });
  it("adds the waits of the gap and of the window", async () => {
    const c = fakeClock();
    const l = limiter(c, 6, 1000); // 10 s gap
    await l.acquire(900);
    const waited = await l.acquire(900);
    expect(waited).toBe(10_000 + 50_000);
    expect(c.sleeps).toEqual([10_000, 50_000]);
  });
  it("does not look at tokens when the limit is unknown", async () => {
    const c = fakeClock();
    const l = limiter(c, 600, null);
    await l.acquire(10 ** 9);
    c.t += 100;
    expect(await l.acquire(10 ** 9)).toBe(0);
  });
});

describe("settle", () => {
  it("replaces the latest reservation with what the provider reported", async () => {
    const c = fakeClock();
    const l = limiter(c, 600, 1000);
    await l.acquire(900);
    l.settle(100);
    c.t += 100;
    expect(await l.acquire(900)).toBe(0); // 100 + 900 fits
  });
  it("keeps the estimate when the provider reported nothing (0 or less)", async () => {
    const c = fakeClock();
    const l = limiter(c, 600, 1000);
    await l.acquire(900);
    l.settle(0);
    c.t += 100;
    expect(await l.acquire(900)).toBeGreaterThan(0);
  });
  it("only changes the latest reservation, and does nothing before any request", async () => {
    const c = fakeClock();
    const l = limiter(c, 600, 1000);
    l.settle(5); // no reservation yet: no error
    await l.acquire(500);
    c.t += 100;
    await l.acquire(500);
    l.settle(10);
    c.t += 100;
    expect(await l.acquire(500)).toBeGreaterThan(0); // 500 (first, unchanged) + 10 + 500 > 1000
    expect(await limiter(fakeClock(), 600, 1000).acquire(1)).toBe(0);
  });
});
