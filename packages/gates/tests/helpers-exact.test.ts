import { describe, expect, it } from "vitest";
import type { NarrationSentence } from "@eve/schema";
import { claimsOf, claimsSpokenBy, introductions, sentenceOrder, wordCount } from "../src/helpers";

const sent = (over: Partial<NarrationSentence> & { id: string; beatId: string }): NarrationSentence => ({ text: "x", ...over }) as unknown as NarrationSentence;
const ctx = (beats: string[], script: NarrationSentence[], claims?: unknown[]) => ({ bundle: { plan: { beats: beats.map((id) => ({ id })) }, script, ...(claims ? { claims } : {}) } }) as never;

describe("gate helpers, exactly", () => {
  it("claimsOf is the bundle's claims, and an empty list when it has none", () => {
    expect(claimsOf(ctx([], []))).toEqual([]);
    const list = [{ id: "c" }];
    expect(claimsOf(ctx([], [], list))).toBe(list);
  });

  it("a claim sentence speaks for its claim only when it names one", () => {
    expect(claimsSpokenBy(sent({ id: "a", beatId: "b", role: "claim", claimId: "c1" }))).toEqual(["c1"]);
    expect(claimsSpokenBy(sent({ id: "a", beatId: "b", role: "claim" }))).toEqual([]);
  });

  it("a link sentence speaks for both its claims (a copy), and a sentence of another role speaks for none even when it carries ids", () => {
    const link = sent({ id: "a", beatId: "b", role: "link", linkClaimIds: ["c1", "c2"] });
    const spoken = claimsSpokenBy(link);
    expect(spoken).toEqual(["c1", "c2"]);
    expect(spoken).not.toBe(link.linkClaimIds);
    expect(claimsSpokenBy(sent({ id: "a", beatId: "b", role: "link" }))).toEqual([]);
    expect(claimsSpokenBy(sent({ id: "a", beatId: "b", role: "link", claimId: "c9" }))).toEqual([]);
    expect(claimsSpokenBy(sent({ id: "a", beatId: "b", role: "goal", claimId: "c9", linkClaimIds: ["c1", "c2"] }))).toEqual([]);
    expect(claimsSpokenBy(sent({ id: "a", beatId: "b", role: "claim", claimId: "c1", linkClaimIds: ["c8", "c9"] }))).toEqual(["c1"]);
  });

  it("sentences are ordered by beat, then by script position; a sentence of an unknown beat comes last", () => {
    const script = [sent({ id: "s2", beatId: "b2" }), sent({ id: "s1", beatId: "b1" }), sent({ id: "s0", beatId: "nope" }), sent({ id: "s1b", beatId: "b1" })];
    expect([...sentenceOrder(ctx(["b1", "b2"], script))]).toEqual([["s1", 0], ["s1b", 1], ["s2", 2], ["s0", 3]]);
  });

  it("a claim is introduced at its first claim-role sentence in telling order, whatever the order of the script list", () => {
    const script = [
      sent({ id: "late", beatId: "b2", role: "claim", claimId: "c" }),
      sent({ id: "early", beatId: "b1", role: "claim", claimId: "c" }),
      sent({ id: "g", beatId: "b1", role: "goal", claimId: "c2" }),
      sent({ id: "l", beatId: "b1", role: "link", claimId: "c3", linkClaimIds: ["c", "c2"] }),
      sent({ id: "bare", beatId: "b1", role: "claim" }),
    ];
    const got = introductions(ctx(["b1", "b2"], script));
    expect([...got]).toEqual([["c", 0]]);
  });

  it("the first of two sentences for one claim wins when the script lists the earlier one first", () => {
    const script = [sent({ id: "a", beatId: "b1", role: "claim", claimId: "c" }), sent({ id: "z", beatId: "b2", role: "claim", claimId: "c" })];
    expect(introductions(ctx(["b1", "b2"], script)).get("c")).toBe(0);
  });

  it("counts words split on runs of white space", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("  one   two\tthree\nfour ")).toBe(4);
  });
});
