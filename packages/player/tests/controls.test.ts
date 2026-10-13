// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { formatTime, mountControls, showQuestion } from "../src";

class FakePlayer {
  playing = false;
  t = 0;
  calls: string[] = [];
  async play() {
    this.calls.push("play");
    this.playing = true;
  }
  pause() {
    this.calls.push("pause");
    this.playing = false;
  }
  seek(ms: number) {
    this.calls.push(`seek ${ms}`);
    this.t = ms;
  }
}
const frames = () => {
  const q: Array<() => void> = [];
  return { raf: (cb: () => void) => q.push(cb), caf: vi.fn(), step: () => q.splice(0).forEach((f) => f()), size: () => q.length };
};
const make = (over: Partial<Parameters<typeof mountControls>[0]> = {}) => {
  const root = document.createElement("div");
  const player = new FakePlayer();
  const clock = { nowMs: () => player.t, isPlaying: () => player.playing };
  const f = frames();
  const handle = mountControls({ root, player, clock, totalMs: 69_000, pausePoints: [{ id: "ask3", atMs: 34_500 }, { id: "ask5", atMs: 62_100 }], raf: f.raf, caf: f.caf, ...over });
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  return { root, player, f, handle, q };
};

describe("formatTime", () => {
  it.each([[0, "0:00"], [999, "0:00"], [1000, "0:01"], [59_999, "0:59"], [60_000, "1:00"], [69_079, "1:09"], [600_000, "10:00"], [-5, "0:00"]])("%i ms is %s", (ms, s) => expect(formatTime(ms)).toBe(s));
});

describe("the control bar", () => {
  it("has play, the time, a seek bar with a tick for each question, and a restart button, labelled for a screen reader", () => {
    const { q, root } = make();
    expect(q(".eve-controls").getAttribute("role")).toBe("group");
    expect(q(".eve-btn-play").getAttribute("aria-label")).toBe("Play");
    expect(q(".eve-time").textContent).toBe("0:00 / 1:09");
    expect(q<HTMLInputElement>(".eve-seek").max).toBe("69000");
    expect(q(".eve-seek").getAttribute("aria-label")).toBe("Position in the lesson");
    expect(q(".eve-btn-ghost").getAttribute("aria-label")).toBe("Start again");
    const ticks = Array.from(root.querySelectorAll<HTMLElement>(".eve-tick-q"));
    expect(ticks.map((t) => [t.dataset.question, t.style.left])).toEqual([["ask3", `${(34_500 / 69_000) * 100}%`], ["ask5", `${(62_100 / 69_000) * 100}%`]]);
    expect(ticks.every((t) => t.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(ticks[0]!.title).toBe("Question 0:34");
    expect(root.textContent).not.toMatch(/points at/i);
  });

  it("the play button plays, then reads Pause and pauses", () => {
    const { q, player } = make();
    q<HTMLButtonElement>(".eve-btn-play").click();
    expect(player.calls).toEqual(["play"]);
    expect(q(".eve-btn-play").getAttribute("aria-label")).toBe("Pause");
    expect(q(".eve-btn-play").dataset.state).toBe("playing");
    q<HTMLButtonElement>(".eve-btn-play").click();
    expect(player.calls).toEqual(["play", "pause"]);
    expect(q(".eve-btn-play").getAttribute("aria-label")).toBe("Play");
    expect(q(".eve-btn-play").dataset.state).toBe("paused");
  });

  it("follows the player when something else pauses it (a question, a phone call)", () => {
    const { q, player, f } = make();
    player.playing = true;
    f.step();
    expect(q(".eve-btn-play").dataset.state).toBe("playing");
    player.playing = false;
    f.step();
    expect(q(".eve-btn-play").dataset.state).toBe("paused");
  });

  it("dragging the seek bar seeks, and the time and bar follow the clock", () => {
    const { q, player, f } = make();
    const seek = q<HTMLInputElement>(".eve-seek");
    seek.value = "20000";
    seek.dispatchEvent(new Event("input"));
    expect(player.calls).toEqual(["seek 20000"]);
    expect(q(".eve-time").textContent).toBe("0:20 / 1:09");
    player.t = 41_500;
    f.step();
    expect(q(".eve-time").textContent).toBe("0:41 / 1:09");
    expect(seek.value).toBe("41500");
    expect(seek.getAttribute("aria-valuetext")).toBe("0:41 of 1:09");
    expect(seek.style.getPropertyValue("--eve-progress")).toBe(`${(41_500 / 69_000) * 100}%`);
  });

  it("restart goes to the beginning", () => {
    const { q, player } = make();
    player.t = 30_000;
    q<HTMLButtonElement>(".eve-btn-ghost").click();
    expect(player.calls).toEqual(["seek 0"]);
    expect(q(".eve-time").textContent).toBe("0:00 / 1:09");
  });

  it("does not fight the student: while the seek bar has focus its value is left alone", () => {
    const { q, player, f, root } = make();
    document.body.append(root);
    const seek = q<HTMLInputElement>(".eve-seek");
    seek.focus();
    player.t = 50_000;
    f.step();
    expect(seek.value).toBe("0");
    expect(q(".eve-time").textContent).toBe("0:50 / 1:09");
    root.remove();
  });

  it("words can be translated", () => {
    const { q } = make({ labels: { play: "चलाएँ", pause: "रोकें", restart: "फिर से", seek: "स्थिति", question: "प्रश्न" } });
    expect(q(".eve-btn-play").getAttribute("aria-label")).toBe("चलाएँ");
    expect(q(".eve-tick-q").title).toMatch(/^प्रश्न /);
  });

  it("keeps one frame loop going, and destroy stops it and removes the bar", () => {
    const { f, handle, root } = make();
    expect(f.size()).toBe(1);
    f.step();
    expect(f.size()).toBe(1);
    handle.destroy();
    expect(root.querySelector(".eve-controls")).toBeNull();
    expect(f.caf).toHaveBeenCalled();
    f.step();
    expect(f.size()).toBe(0);
  });

  it("uses the browser frame loop by default", () => {
    const raf = vi.fn(() => 3);
    const caf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", caf);
    const root = document.createElement("div");
    const p = new FakePlayer();
    const h = mountControls({ root, player: p, clock: { nowMs: () => 0, isPlaying: () => false }, totalMs: 1000, pausePoints: [] });
    expect(raf).toHaveBeenCalled();
    h.destroy();
    expect(caf).toHaveBeenCalledWith(3);
    vi.unstubAllGlobals();
  });
});

describe("the question", () => {
  it("shows the prompt and one button, and resolves when the student continues", async () => {
    const root = document.createElement("div");
    let done = false;
    const p = showQuestion(root, "Does the shortcut match the long way?").then(() => (done = true));
    const box = root.querySelector(".eve-question")!;
    expect(box.querySelector("p")!.textContent).toBe("Does the shortcut match the long way?");
    expect(box.querySelector("strong")!.textContent).toBe("Your turn");
    expect(box.getAttribute("role")).toBe("group");
    await Promise.resolve();
    expect(done).toBe(false);
    box.querySelector<HTMLButtonElement>("button")!.click();
    await p;
    expect(done).toBe(true);
    expect(root.querySelector(".eve-question")).toBeNull();
  });
  it("takes its words from the caller", () => {
    const root = document.createElement("div");
    void showQuestion(root, "?", { heading: "आपकी बारी", continue: "आगे बढ़ें" });
    expect(root.querySelector("button")!.textContent).toBe("आगे बढ़ें");
    expect(root.querySelector("strong")!.textContent).toBe("आपकी बारी");
  });
});
