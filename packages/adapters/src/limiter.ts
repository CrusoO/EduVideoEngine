import type { ModelProfile } from "./profiles";
import { LlmRefused } from "./types";

export type Clock = { now(): number; sleep(ms: number): Promise<void> };
export const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** Characters per token, deliberately low (3) so the estimate runs high and a request is never sent that the provider would refuse for size. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 3);

/** The tokens one request is expected to use: its input, plus the output it is expected to write, plus the reasoning the model is expected to spend. */
export const estimateRequest = (system: string, input: string, expectedOutputTokens: number, profile: ModelProfile): number =>
  estimateTokens(system) + estimateTokens(input) + expectedOutputTokens + (profile.reasoning ? (profile.expectedReasoningTokens ?? 0) : 0);

/**
 * Honours the three limits a free tier has: requests per minute (requests are spaced), tokens per minute (a sliding window of the last 60 s; the call waits for room)
 * and requests per day (counted by the caller from the ledger). A request whose estimate alone is over the per-minute token limit can never be sent, so it fails
 * at once with a clear message instead of being sent and refused.
 */
export class RateLimiter {
  private lastStart: number | undefined;
  private window: Array<{ at: number; tokens: number }> = [];

  constructor(private readonly clock: Clock, private readonly label: string, private readonly limits: { rpm: number; tpm: number | null }) {}

  /** Throws, before anything is sent, if the request can never fit the per-minute token limit. */
  failFast(estimated: number): void {
    if (this.limits.tpm !== null && estimated > this.limits.tpm) {
      throw new LlmRefused(`${this.label}: this request is estimated at ${estimated} tokens (input plus expected output and reasoning) but the per-minute token limit is ${this.limits.tpm}. It can never be sent as one request; split it or use a model with a larger limit. Nothing was sent.`);
    }
  }

  /** Waits until a request of this size may start, and reserves its tokens. Returns the milliseconds waited. */
  async acquire(estimated: number, lastLedgerStart?: number): Promise<number> {
    let waited = 0;
    const gap = Math.ceil(60_000 / this.limits.rpm);
    const last = this.lastStart ?? lastLedgerStart;
    if (last !== undefined) {
      const wait = last + gap - this.clock.now();
      if (wait > 0) {
        await this.clock.sleep(wait);
        waited += wait;
      }
    }
    if (this.limits.tpm !== null) {
      for (;;) {
        const now = this.clock.now();
        this.window = this.window.filter((w) => now - w.at < 60_000);
        const used = this.window.reduce((n, w) => n + w.tokens, 0);
        if (used + estimated <= this.limits.tpm || this.window.length === 0) break;
        const wait = Math.max(50, this.window[0]!.at + 60_000 - now);
        await this.clock.sleep(wait);
        waited += wait;
      }
    }
    this.lastStart = this.clock.now();
    this.window.push({ at: this.lastStart, tokens: estimated });
    return waited;
  }

  /** Replaces the reservation of the latest request with what the provider reported. */
  settle(actual: number): void {
    const last = this.window[this.window.length - 1];
    if (last && actual > 0) last.tokens = actual;
  }
}
