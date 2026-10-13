import type { FileVoiceAdapter } from "./adapter";

/** The production gate: a build for real students refuses a voice that is not cleared for a shipped product. */
export function requireCleared(adapter: Pick<FileVoiceAdapter, "id" | "status">): void {
  if (adapter.status !== "cleared") throw new Error(`voice ${adapter.id} is ${adapter.status}: it cannot be used in a production build`);
}
