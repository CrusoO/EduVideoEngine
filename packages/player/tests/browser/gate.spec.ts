import { expect, test } from "@playwright/test";

/** Phase 0 gate evidence that is not timing: playing with the network cut, and Devanagari through the player. */
type W = Window &
  typeof globalThis & {
    __ready: boolean;
    __timeline: { totalMs: number; events: { targetObject: string; action: string; atMs: number }[] };
    __player: { play(): Promise<void>; seek(ms: number): void };
    __clock: { nowMs(): number; isPlaying(): boolean };
    __setAnswerDelay(ms: number): void;
  };

test("offline: after the lesson has loaded, with the network cut, the whole lesson plays to the end and nothing is requested", async ({ page, context }) => {
  const outside: string[] = [];
  const afterCut: string[] = [];
  let cut = false;
  page.on("request", (r) => {
    if (!/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(r.url())) outside.push(r.url());
    if (cut) afterCut.push(r.url());
  });
  await page.goto("/?voice=piper");
  await page.waitForFunction(() => (window as unknown as W).__ready === true);
  await context.setOffline(true);
  cut = true;
  await page.evaluate(() => (window as unknown as W).__setAnswerDelay(0));
  await page.evaluate(() => (window as unknown as W).__player.play());
  await page.waitForFunction(() => {
    const w = window as unknown as W;
    return !w.__clock.isPlaying() && w.__clock.nowMs() >= w.__timeline.totalMs - 1;
  }, null, { timeout: 150_000 });
  expect(afterCut, "no request at all after the network was cut").toEqual([]);
  expect(outside, "nothing was ever requested from outside the harness").toEqual([]);
  const shown = await page.evaluate(() => (window as unknown as W).__timeline.events.filter((e) => e.action === "reveal").length);
  expect(shown).toBe(12);
});

test("Devanagari through the player: conjuncts shaped by Noto Sans Devanagari, Latin words in the same family, nothing clipped, equation free of Devanagari", async ({ page, context }) => {
  await page.goto("/?voice=tone&lesson=hindi&mpw=300");
  await page.waitForFunction(() => (window as unknown as W).__ready === true);
  await page.evaluate(() => {
    const w = window as unknown as W;
    w.__player.seek(w.__timeline.totalMs - 100);
  });
  const client = await context.newCDPSession(page);
  await client.send("DOM.enable");
  await client.send("CSS.enable");
  const { root } = await client.send("DOM.getDocument", { depth: 0 });
  for (const id of ["title", "mixed", "body"]) {
    const { nodeId } = await client.send("DOM.querySelector", { nodeId: root.nodeId, selector: `[data-object-id="${id}"]` });
    const { fonts } = await client.send("CSS.getPlatformFontsForNode", { nodeId });
    expect(fonts.length, id).toBeGreaterThan(0);
    for (const f of fonts) expect(f.familyName, `${id} uses only the bundled Noto Sans Devanagari`).toMatch(/^Noto Sans Devanagari( Bold| Medium)?$/);
  }
  const metrics = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".eve-text")).map((el) => {
      const cs = getComputedStyle(el);
      return { id: el.dataset.objectId, clipped: el.scrollHeight > el.clientHeight + 1, ratio: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize), lang: el.getAttribute("lang") };
    }),
  );
  for (const m of metrics) {
    expect(m.clipped, m.id).toBe(false);
    expect(m.ratio, m.id).toBeGreaterThanOrEqual(1.49);
    expect(m.lang).toBe("hi-IN");
  }
  expect(await page.locator('[data-object-id="eq"] .katex-mathml').first().innerText()).not.toMatch(/[ऀ-ॿ]/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator("#root")).toHaveScreenshot("player-hindi-360.png");
});
