import type { MasterClock } from "./clock";
import type { Player } from "./player";

export type ControlsOptions = {
  /** Where the bar goes: under the stage and caption, inside the same card. */
  root: HTMLElement;
  player: Pick<Player, "play" | "pause" | "seek">;
  clock: Pick<MasterClock, "nowMs" | "isPlaying">;
  totalMs: number;
  /** Where the lesson stops to ask a question (from the Timeline): drawn as ticks on the track, nothing else. */
  pausePoints: ReadonlyArray<{ id: string; atMs: number }>;
  /** Words for the buttons, so a language can change them. Defaults are English. */
  labels?: { play: string; pause: string; restart: string; seek: string; question: string };
  /** Frame loop, injected for tests. */
  raf?: (cb: () => void) => number;
  caf?: (id: number) => void;
};

const ICON = {
  play: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>`,
  restart: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 5V2L7 6.5 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8z" fill="currentColor"/></svg>`,
};

export const formatTime = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The control bar: play and pause, the time, a seek bar with ticks where questions come, restart. It follows the host theme through its
 * --c-* variables (with the light values as fallbacks) and never the dark stage theme. It only calls the player and reads the clock.
 */
export function mountControls(o: ControlsOptions): { destroy(): void; update(): void } {
  const L = o.labels ?? { play: "Play", pause: "Pause", restart: "Start again", seek: "Position in the lesson", question: "Question" };
  const raf = o.raf ?? ((cb: () => void) => requestAnimationFrame(cb));
  const caf = o.caf ?? ((id: number) => cancelAnimationFrame(id));

  const bar = document.createElement("div");
  bar.className = "eve-controls";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Lesson controls");

  const play = document.createElement("button");
  play.type = "button";
  play.className = "eve-btn eve-btn-play";
  const restart = document.createElement("button");
  restart.type = "button";
  restart.className = "eve-btn eve-btn-ghost";
  restart.setAttribute("aria-label", L.restart);
  restart.title = L.restart;
  restart.innerHTML = ICON.restart;

  const time = document.createElement("span");
  time.className = "eve-time";

  const track = document.createElement("div");
  track.className = "eve-track";
  const seek = document.createElement("input");
  seek.type = "range";
  seek.className = "eve-seek";
  seek.min = "0";
  seek.max = String(o.totalMs);
  seek.step = "100";
  seek.value = "0";
  seek.setAttribute("aria-label", L.seek);
  track.append(seek);
  for (const p of o.pausePoints) {
    const tick = document.createElement("span");
    tick.className = "eve-tick-q";
    tick.setAttribute("aria-hidden", "true");
    tick.dataset.question = p.id;
    tick.style.left = `${(p.atMs / o.totalMs) * 100}%`;
    tick.title = `${L.question} ${formatTime(p.atMs)}`;
    track.append(tick);
  }

  bar.append(play, time, track, restart);
  o.root.append(bar);

  let last = { playing: null as boolean | null, t: -1 };
  const update = () => {
    const t = o.clock.nowMs();
    const playing = o.clock.isPlaying();
    if (playing !== last.playing) {
      play.innerHTML = playing ? ICON.pause : ICON.play;
      play.setAttribute("aria-label", playing ? L.pause : L.play);
      play.title = playing ? L.pause : L.play;
      play.dataset.state = playing ? "playing" : "paused";
    }
    if (Math.floor(t / 100) !== Math.floor(last.t / 100) || playing !== last.playing) {
      time.textContent = `${formatTime(t)} / ${formatTime(o.totalMs)}`;
      if (document.activeElement !== seek) seek.value = String(Math.round(t));
      seek.setAttribute("aria-valuetext", `${formatTime(t)} of ${formatTime(o.totalMs)}`);
      seek.style.setProperty("--eve-progress", `${(t / o.totalMs) * 100}%`);
    }
    last = { playing, t };
  };

  play.onclick = () => {
    if (o.clock.isPlaying()) o.player.pause();
    else void o.player.play();
    update();
  };
  restart.onclick = () => {
    o.player.seek(0);
    update();
  };
  seek.oninput = () => {
    o.player.seek(Number(seek.value));
    update();
  };

  let frame = 0;
  let alive = true;
  const loop = () => {
    if (!alive) return;
    update();
    frame = raf(loop);
  };
  update();
  frame = raf(loop);

  return {
    update,
    destroy() {
      alive = false;
      caf(frame);
      bar.remove();
    },
  };
}

/** The question the lesson stops for: the prompt and one button. Resolves when the student continues. */
export function showQuestion(root: HTMLElement, prompt: string, labels = { heading: "Your turn", continue: "I have answered: continue" }): Promise<void> {
  return new Promise((done) => {
    const box = document.createElement("div");
    box.className = "eve-question";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", labels.heading);
    const h = document.createElement("strong");
    h.textContent = labels.heading;
    const p = document.createElement("p");
    p.textContent = prompt;
    const go = document.createElement("button");
    go.type = "button";
    go.className = "eve-btn eve-btn-primary";
    go.textContent = labels.continue;
    go.onclick = () => {
      box.remove();
      done();
    };
    box.append(h, p, go);
    root.append(box);
    go.focus();
  });
}
