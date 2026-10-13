import { expect, test, type Page } from "@playwright/test";

const CASES = ["scene1-predict", "scene3-worked", "scene4-graph", "hindi-text"] as const;
const WIDTHS = [360, 1280] as const;

async function open(page: Page, name: string, width: number, t?: number) {
  const external: string[] = [];
  page.on("request", (r) => {
    if (!/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(r.url())) external.push(r.url());
  });
  await page.setViewportSize({ width: Math.max(width, 360), height: 1000 });
  await page.goto(`/?case=${name}&w=${width}${t === undefined ? "" : `&t=${t}`}`);
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
  return external;
}

for (const name of CASES) {
  for (const width of WIDTHS) {
    test(`golden frame: ${name} at ${width}px`, async ({ page }) => {
      const external = await open(page, name, width);
      await expect(page.locator("#stage")).toHaveScreenshot(`${name}-${width}.png`);
      expect(external, "nothing is fetched from outside the harness: fonts are bundled").toEqual([]);
      // nothing sideways: neither the page nor the stage scrolls horizontally
      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        stage: (document.getElementById("stage") as HTMLElement).scrollWidth - (document.getElementById("stage") as HTMLElement).clientWidth,
      }));
      expect(overflow.page).toBeLessThanOrEqual(1);
      expect(overflow.stage).toBeLessThanOrEqual(1);
    });
  }
}

test("seek contract: drawing at t=3000, then 0, then 99999, then 3000 again gives the same pixels and the same DOM", async ({ page }) => {
  await open(page, "scene1-predict", 360);
  const stage = page.locator("#stage");
  const draw = (t: number) => page.evaluate((x) => (window as unknown as { __render: (t: number) => void }).__render(x), t);
  const html = () => stage.evaluate((el) => el.innerHTML);
  await draw(3000);
  const first = await html();
  const shot1 = await stage.screenshot();
  await draw(0);
  await draw(99999);
  await draw(1200);
  await draw(3000);
  expect(await html()).toBe(first);
  expect((await stage.screenshot()).equals(shot1), "pixels are identical after seeking away and back").toBe(true);
});

test("seek contract: at t=0 the equation and highlight are hidden; at t=3000 both are shown", async ({ page }) => {
  await open(page, "scene1-predict", 360, 0);
  const visibility = (id: string) => page.locator(`[data-object-id="${id}"]`).evaluate((el) => getComputedStyle(el).visibility);
  expect(await visibility("eq1")).toBe("hidden");
  expect(await visibility("ring")).toBe("hidden");
  await page.evaluate(() => (window as unknown as { __render: (t: number) => void }).__render(3000));
  expect(await visibility("eq1")).toBe("visible");
  expect(await visibility("ring")).toBe("visible");
});

test("equations render through KaTeX with MathML for screen readers", async ({ page }) => {
  await open(page, "scene1-predict", 360);
  await expect(page.locator(".katex").first()).toBeVisible();
  expect(await page.locator(".katex-mathml math").count()).toBeGreaterThan(0);
});

test("Devanagari conjuncts: shaped by the browser in Noto Sans Devanagari, Latin words in the same family, nothing clipped", async ({ page, context }) => {
  await open(page, "hindi-text", 360);
  const client = await context.newCDPSession(page);
  await client.send("DOM.enable");
  await client.send("CSS.enable");
  const { root } = await client.send("DOM.getDocument", { depth: 0 });
  for (const id of ["title", "body", "mixed"]) {
    const { nodeId } = await client.send("DOM.querySelector", { nodeId: root.nodeId, selector: `[data-object-id="${id}"]` });
    const { fonts } = await client.send("CSS.getPlatformFontsForNode", { nodeId });
    expect(fonts.length, id).toBeGreaterThan(0);
    for (const f of fonts) expect(f.familyName, `${id} uses only the bundled Noto Sans Devanagari`).toMatch(/^Noto Sans Devanagari( Bold| Medium)?$/);
  }
  // No clipped matras: every text object holds its own content, and its line box is at least the font size x 1.5.
  const metrics = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".eve-text")).map((el) => {
      const cs = getComputedStyle(el);
      return { clipped: el.scrollHeight > el.clientHeight + 1, ratio: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) };
    }),
  );
  for (const m of metrics) {
    expect(m.clipped).toBe(false);
    expect(m.ratio).toBeGreaterThanOrEqual(1.49); // title 1.5, body 1.7
  }
  // The equation beside the Hindi text is symbols only: KaTeX never saw a Devanagari character.
  const mathText = await page.locator(".katex-mathml").first().innerText();
  expect(mathText).not.toMatch(/[ऀ-ॿ]/);
});

test("all fonts used are the bundled ones", async ({ page }) => {
  await open(page, "scene4-graph", 360);
  const loaded = await page.evaluate(() => Array.from(document.fonts).filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")));
  expect(loaded).toContain("Noto Sans");
  expect(loaded.some((f) => f.startsWith("KaTeX"))).toBe(true);
});
