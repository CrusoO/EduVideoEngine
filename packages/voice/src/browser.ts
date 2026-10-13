import type { AudioTrack } from "@eve/schema";

/** Browser side: fetch and decode each track file into an AudioBuffer the audio clock can schedule. */
export async function loadBuffers(ctx: BaseAudioContext, tracks: readonly AudioTrack[], fetcher: typeof fetch = fetch): Promise<Map<string, AudioBuffer>> {
  const out = new Map<string, AudioBuffer>();
  await Promise.all(
    tracks.map(async (t) => {
      if (!t.url) throw new Error(`track ${t.sentenceId} has no url`);
      const res = await fetcher(t.url);
      if (!res.ok) throw new Error(`cannot load ${t.url}: ${res.status}`);
      out.set(t.sentenceId, await ctx.decodeAudioData(await res.arrayBuffer()));
    }),
  );
  return out;
}
