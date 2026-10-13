import { componentFor, formulaLatex, spokenLabel, type MathRenderer, type Rect, type RenderContext } from "@eve/components";
import { eventsFor } from "@eve/resolver";
import type { LessonBundle, PausePoint, SceneSpec, Timeline } from "@eve/schema";
import { DEFAULT_CHROME_PX, PAD, solve, stageFrame } from "@eve/layout";
import { colorTheme } from "../theme/palette";
import type { MasterClock } from "./clock";

export type PlayerOptions = {
  root: HTMLElement;
  /** Content only: objects, props, expressions, sentence text. Every time comes from the Timeline. */
  bundle: LessonBundle;
  timeline: Timeline;
  math: MathRenderer;
  clock: MasterClock;
  /** Called when playback reaches a pause point; the lesson stays frozen until the promise resolves. */
  onPause?: (point: PausePoint) => Promise<void>;
  onEnd?: () => void;
  /** Shown under the caption wherever a synthetic voice is heard (the voice licence asks for it). */
  credit?: string;
  /** The audio device was interrupted (call, lock screen): the lesson has paused itself, show a play button. */
  onInterrupt?: () => void;
  /** Wall clock for the stall watchdog. Injected for tests. */
  now?: () => number;
  /** Width of the stage in pixels, for the layout solver. Default: the real width of the stage element (0 when nothing is laid out, as in jsdom, in which case the stage stays a plain column). */
  stageWidth?: () => number;
  /** Jump every motion to its end state. Default: the prefers-reduced-motion setting of the browser, read at every draw. */
  reduceMotion?: boolean;
  /** Height taken by the lesson sheet around the stage, in pixels (ADR 0017: a parameter, default 184, unconfirmed). */
  chromePx?: number;
  /** Dynamic viewport height in pixels (dvh). Default: the visual viewport, which shrinks when a phone browser shows its address bar. */
  viewportHeight?: () => number;
  /** A scene needs more height than its stage has (the build should have caught it): by how many pixels. */
  onOverflow?: (info: { sceneId: string; excessPx: number }) => void;
  /** Called after every draw, with the lesson time that was drawn. For measurement. */
  onFrame?: (drawnMs: number) => void;
  /** Injected for tests. */
  raf?: (cb: () => void) => number;
  caf?: (id: number) => void;
};

const OVERLAY = new Set(["highlight"]);

/**
 * Plays a resolved lesson. It reads the Timeline for every time (scene windows, events, pause points) and the bundle only
 * for what to draw. Each frame it asks the master clock for the lesson time and redraws from that single number, so
 * pause, seek and replay are all the same operation: draw at t. Pause points freeze, ask and resume; the player does not
 * work out where they are.
 */
export class Player {
  private sceneId: string | null = null;
  private els = new Map<string, HTMLElement>();
  private events = new Map<string, ReturnType<typeof eventsFor>>();
  private frame = 0;
  private running = false;
  private answered = new Set<string>();
  private lastT = 0;
  private asking = false;
  private readonly caption: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly sceneById: Map<string, SceneSpec>;
  private readonly sentenceText: Map<string, string>;
  private captionId: string | null = null;
  private laidKey = "";
  private readonly colors: ReturnType<typeof colorTheme>;
  private resizeObserver: ResizeObserver | null = null;
  private readonly raf: (cb: () => void) => number;
  private readonly caf: (id: number) => void;

  constructor(private readonly o: PlayerOptions) {
    this.raf = o.raf ?? ((cb) => requestAnimationFrame(cb));
    this.caf = o.caf ?? ((id) => cancelAnimationFrame(id));
    this.colors = colorTheme(o.bundle.termColors);
    this.sceneById = new Map(o.bundle.scenes.map((s) => [s.id, s]));
    this.sentenceText = new Map(o.bundle.script.map((s) => [s.id, s.text]));
    o.root.replaceChildren();
    this.stage = document.createElement("div");
    this.stage.className = "eve-stage eve-player-stage";
    this.stage.lang = o.bundle.locale;
    this.caption = document.createElement("p");
    this.caption.className = "eve-caption";
    this.caption.lang = o.bundle.locale;
    this.caption.setAttribute("data-testid", "caption");
    const surround = document.createElement("div");
    surround.className = "eve-surround";
    surround.append(this.stage);
    o.root.append(surround, this.caption);
    if (o.credit) {
      const credit = document.createElement("p");
      credit.className = "eve-credit";
      credit.textContent = o.credit;
      o.root.append(credit);
    }
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.o.root.isConnected) this.draw(this.o.clock.nowMs());
      });
      this.resizeObserver.observe(this.stage);
    }
    this.o.clock.onInterrupt?.(() => {
      this.pause();
      this.o.onInterrupt?.();
    });
    this.draw(this.o.clock.nowMs());
  }

  get timeMs(): number {
    return this.o.clock.nowMs();
  }

  async play(): Promise<void> {
    if (this.o.clock.nowMs() >= this.o.timeline.totalMs) this.seek(0); // replay from the start
    await this.o.clock.play();
    if (!this.running) {
      this.running = true;
      this.loop();
    }
  }

  pause(): void {
    this.o.clock.pause();
    this.running = false;
    this.caf(this.frame);
    this.draw(this.o.clock.nowMs());
  }

  seek(ms: number): void {
    this.o.clock.seek(ms);
    const t = this.o.clock.nowMs();
    // Pause points ahead of the new position can be asked again; those behind it count as answered.
    this.answered = new Set(this.o.timeline.pausePoints.filter((p) => p.atMs <= t).map((p) => p.id));
    this.lastT = t;
    this.draw(t);
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.running = false;
    this.caf(this.frame);
    this.o.clock.pause();
    this.o.root.replaceChildren();
  }

  /** One scheduling pass: sample the clock, redraw, handle pause points and the end. Exposed so a test can step it. */
  tick(): void {
    this.o.clock.watchdog?.(this.o.now ? this.o.now() : performance.now());
    if (!this.running) return; // the watchdog found an interruption and paused us
    const t = this.o.clock.nowMs();
    this.draw(t);
    const due = this.o.timeline.pausePoints.find((p) => !this.answered.has(p.id) && this.lastT <= p.atMs && p.atMs <= t);
    this.lastT = t;
    if (due && !this.asking) void this.ask(due);
    else if (t >= this.o.timeline.totalMs && this.o.clock.isPlaying()) {
      this.pause();
      this.o.onEnd?.();
    }
  }

  private async ask(p: PausePoint): Promise<void> {
    this.asking = true;
    this.answered.add(p.id);
    this.o.clock.pause();
    this.o.clock.seek(p.atMs); // freeze exactly on the point, not a frame past it
    this.draw(p.atMs);
    this.running = false;
    this.caf(this.frame);
    try {
      await this.o.onPause?.(p);
    } catch {
      // a question that fails to show must never trap the student: carry on with the lesson
    } finally {
      this.asking = false;
    }
    this.lastT = p.atMs;
    await this.play();
  }

  private loop = (): void => {
    if (!this.running) return;
    this.tick();
    if (this.running) this.frame = this.raf(this.loop);
  };

  private draw(t: number): void {
    const tl = this.o.timeline;
    const scene = [...tl.scenes].reverse().find((s) => s.startMs <= t) ?? tl.scenes[0]!;
    if (scene.sceneId !== this.sceneId) this.mount(scene.sceneId);
    const spec = this.sceneById.get(scene.sceneId)!;
    this.relayout(spec);
    const rectOf = (id: string): Rect | null => {
      const el = this.els.get(id);
      if (!el) return null;
      const s = this.stage.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: r.left - s.left, y: r.top - s.top, width: r.width, height: r.height };
    };
    const reduceMotion = this.o.reduceMotion ?? (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
    for (const pass of ["flow", "overlay"] as const) {
      for (const obj of spec.objects) {
        if (OVERLAY.has(obj.component) !== (pass === "overlay")) continue;
        const ctx: RenderContext = {
          objectId: obj.id,
          locale: this.o.bundle.locale,
          expressions: this.o.bundle.expressions,
          exprRef: obj.exprRef,
          events: this.events.get(obj.id) ?? [],
          math: this.o.math,
          colors: this.colors,
          reduceMotion,
          rectOf,
        };
        componentFor(obj.component).render(this.els.get(obj.id)!, obj.props as never, t, ctx);
      }
    }
    const said = tl.audio.find((a) => a.startMs <= t && t < a.endMs);
    this.showCaption(said ? said.sentenceId : null);
    this.o.onFrame?.(t);
  }

  /**
   * The sentence being spoken. Each {expr:id} placeholder is typeset through the same maths renderer as the equation on
   * screen (the pre-rendered cache in the player), so the caption never shows ASCII maths, and carries the spoken form
   * as its accessible label.
   */
  private showCaption(sentenceId: string | null): void {
    if (this.captionId === sentenceId) return;
    this.captionId = sentenceId;
    this.caption.replaceChildren();
    const text = sentenceId ? this.sentenceText.get(sentenceId) : undefined;
    if (!text) return;
    let last = 0;
    for (const m of text.matchAll(/\{expr:([^}]+)\}/g)) {
      this.caption.append(text.slice(last, m.index));
      last = m.index! + m[0].length;
      const expr = this.o.bundle.expressions[m[1]!];
      if (!expr) throw new Error(`caption: unknown expression ${m[1]}`);
      const span = document.createElement("span");
      span.className = "eve-caption-math";
      span.innerHTML = this.o.math(formulaLatex(expr, this.colors), false);
      span.setAttribute("role", "img");
      span.setAttribute("aria-label", spokenLabel(expr, this.o.bundle.locale));
      this.caption.append(span);
    }
    this.caption.append(text.slice(last));
  }

  /**
   * Put every object where the layout solver says (ADR 0014, 0017). Only when the stage width changed since the last solve:
   * the solver is pure, so the same width always gives the same boxes. The stage keeps its plain column when it has no width.
   */
  private relayout(spec: SceneSpec): void {
    const width = this.o.stageWidth ? this.o.stageWidth() : this.stage.clientWidth;
    const vh = this.o.viewportHeight ? this.o.viewportHeight() : (globalThis.visualViewport?.height ?? globalThis.innerHeight ?? 640);
    const key = `${width}x${vh}`;
    if (key === this.laidKey) return;
    this.laidKey = key;
    if (width <= 2 * PAD) {
      this.stage.classList.remove("eve-laid");
      return;
    }
    const frame = stageFrame(width, vh, this.o.chromePx ?? DEFAULT_CHROME_PX);
    // A scene the solver cannot place is a build error (assureLayout catches it first); here it throws, never draws a guess.
    const layout = solve({ objects: spec.objects, layout: spec.layout }, { width, height: frame.height }, { expressions: this.o.bundle.expressions, locale: this.o.bundle.locale }, { spread: true });
    this.stage.classList.add("eve-laid");
    this.stage.dataset.frame = frame.mode;
    this.stage.style.height = `${frame.height}px`;
    for (const [id, box] of Object.entries(layout.boxes)) {
      const el = this.els.get(id)!;
      el.style.position = "absolute";
      el.style.left = `${box.x}px`;
      el.style.top = `${box.y}px`;
      el.style.width = `${box.width}px`;
      el.style.height = `${box.height}px`;
      el.style.textAlign = layout.centered.includes(id) ? "center" : "";
    }
    if (layout.contentHeight > frame.height) this.o.onOverflow?.({ sceneId: spec.id, excessPx: layout.contentHeight - frame.height });
  }

  private mount(sceneId: string): void {
    this.sceneId = sceneId;
    this.laidKey = "";
    this.els.clear();
    this.events.clear();
    const spec = this.sceneById.get(sceneId)!;
    this.stage.replaceChildren();
    this.stage.setAttribute("aria-label", spec.a11y.altText);
    this.stage.setAttribute("role", "img");
    for (const obj of spec.objects) {
      const el = document.createElement("div");
      el.dataset.objectId = obj.id;
      this.els.set(obj.id, el);
      this.events.set(obj.id, eventsFor(this.o.timeline, sceneId, obj.id));
      this.stage.append(el);
    }
  }
}
