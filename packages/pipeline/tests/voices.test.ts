import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requireCleared } from "@eve/voice";
import {
  KOKORO_VOICES,
  LessonRequest,
  VOICE_REGISTRY,
  chooseEngine,
  isAllowedForUse,
  kokoroSynthesizer,
  parseRegistry,
  piperLangModel,
  piperLangSynthesizer,
  placeStory,
  sanitizeStory,
  stageKey,
  storyOutputOptions,
  storyPageHtml,
  voiceById,
  voiceChoiceProblem,
  voiceNamesFor,
  voicesFor,
} from "../index";

const raw = (): Record<string, unknown> & { voices: Array<Record<string, unknown>> } => structuredClone(JSON.parse(readFileSync(join(__dirname, "../../../config/voices.json"), "utf8")));
const story = { title: "A title", scenes: [{ heading: "h", sentences: ["One.", "Two."], visuals: [] as unknown[] }] };
const base = { requestId: "request-0003", idempotencyKey: "request-0003", curriculum: { board: "CBSE", grade: 10, subject: "biology" }, story };
const parse = (options: unknown) => LessonRequest.safeParse({ ...base, options });

describe("the voice registry (ADR 0120)", () => {
  it("lists every voice the engine speaks with, and the English voices are exactly today's", () => {
    const ids = VOICE_REGISTRY.voices.map((v) => v.id);
    for (const id of ["af_heart", "af_kore", "af_sarah", "af_sky", "af_aoede", "am_adam", "am_michael", "en_GB-jenny_dioco-medium", "hf_alpha", "hf_beta", "hm_omega", "hm_psi", "hi_IN-priyamvada-medium", "ne_NP-chitwan-medium"]) expect(ids).toContain(id);
    expect(ids).toHaveLength(14);
    expect(new Set(ids).size).toBe(ids.length);
    expect(voiceNamesFor("en-IN")).toEqual([...KOKORO_VOICES]); // the English list is unchanged, in the same order
    expect(voicesFor("en-IN").map((v) => v.id)).toContain("en_GB-jenny_dioco-medium");
    expect(voiceNamesFor("en-IN")).not.toContain("en_GB-jenny_dioco-medium"); // chosen by options.voice, not by name
  });

  it("gives the voices of each language", () => {
    expect(voiceNamesFor("hi-IN")).toEqual(["hf_alpha", "hf_beta", "hm_omega", "hm_psi", "hi_IN-priyamvada-medium"]);
    expect(voiceNamesFor("ne-NP")).toEqual(["ne_NP-chitwan-medium"]);
    expect(voicesFor("fr-FR")).toEqual([]);
    expect(voicesFor("ne-NP").every((v) => v.engine === "piper")).toBe(true); // no Kokoro voice speaks Nepali
  });

  it("states licences as the cards state them and invents none", () => {
    const priyamvada = voiceById("hi_IN-priyamvada-medium")!;
    expect(priyamvada.licence.model).toContain("by-nc-sa/4.0");
    expect(priyamvada.licence.model).toContain("non-commercial");
    const chitwan = voiceById("ne_NP-chitwan-medium")!;
    expect(chitwan.licence.model).toBe("unstated (the model card states the dataset licence only)");
    expect(chitwan.licence.voiceData).toContain("CC0");
    for (const id of ["hf_alpha", "hf_beta", "hm_omega", "hm_psi"]) {
      const v = voiceById(id)!;
      expect(v.quality).toContain("Graded C");
      expect(v.licence.voiceData).toContain("No licence or speaker provenance is stated");
      expect(v.licence.model).toContain("Apache-2.0");
    }
    // no voice is said to be cleared, licensed for a product or reviewed by a person
    for (const v of VOICE_REGISTRY.voices) expect(JSON.stringify(v)).not.toMatch(/\bcleared for (a )?(shipped|production)|\bis licensed for\b|reviewed by a (person|teacher)/i);
  });

  it("carries the GPL-chain rule of ADR 0117 step 2 on the registry and on every voice", () => {
    expect(VOICE_REGISTRY.gplChainRule).toContain("only their output is shipped");
    for (const v of VOICE_REGISTRY.voices) {
      expect(v.gplChain).toMatch(/ship only its output/);
      expect(v.gplChain).toMatch(/GPL/);
    }
  });

  describe("use", () => {
    it("allows development and review of a registry voice, by its name or its manifest id, and never production", () => {
      for (const v of VOICE_REGISTRY.voices) {
        for (const id of [v.id, `${v.engine}:${v.id}`]) {
          expect(isAllowedForUse(id, "development")).toBe(true);
          expect(isAllowedForUse(id, "review")).toBe(true);
          expect(isAllowedForUse(id, "production")).toBe(false);
        }
      }
    });
    it("refuses an unknown voice, an unknown use and a mismatched engine prefix", () => {
      expect(isAllowedForUse("af_unknown", "development")).toBe(false);
      expect(isAllowedForUse("af_heart", "shipping")).toBe(false);
      expect(isAllowedForUse("piper:af_heart", "development")).toBe(false);
      expect(isAllowedForUse("kokoro:hi_IN-priyamvada-medium", "development")).toBe(false);
      expect(isAllowedForUse("", "development")).toBe(false);
    });
    for (const v of VOICE_REGISTRY.voices) {
      it(`the production guard refuses ${v.engine}:${v.id}`, () => {
        expect(v.status).toBe("development-only");
        expect(() => requireCleared({ id: `${v.engine}:${v.id}`, status: v.status })).toThrow(/development-only.*cannot be used in a production build/);
      });
    }
  });

  describe("a corrupted registry is rejected", () => {
    const rejects = (mutate: (r: ReturnType<typeof raw>) => void, message: RegExp) => {
      const r = raw();
      mutate(r);
      expect(() => parseRegistry(r)).toThrow(message);
    };
    it("accepts the registry as committed", () => {
      expect(() => parseRegistry(raw())).not.toThrow();
    });
    it("a voice that is cleared", () => rejects((r) => (r.voices[0]!.status = "cleared"), /status/));
    it("a voice that may be used in production", () => rejects((r) => (r.voices[0]!.useAllowed = ["development", "production"]), /useAllowed/));
    it("a voice with no use at all", () => rejects((r) => (r.voices[0]!.useAllowed = []), /useAllowed/));
    it("a voice listed twice", () => rejects((r) => r.voices.push(structuredClone(r.voices[0]!)), /listed twice/));
    it("a Hindi voice listed as English", () => rejects((r) => (r.voices.find((v) => v.id === "hf_alpha")!.locales = ["en-IN"]), /speaks hi-IN, not en-IN/));
    it("a Nepali voice listed as Hindi", () => rejects((r) => (r.voices.find((v) => v.id === "ne_NP-chitwan-medium")!.locales = ["hi-IN"]), /speaks ne-NP, not hi-IN/));
    it("a Kokoro voice for Nepali", () => rejects((r) => ((r.voices[0]!.id = "nf_x"), (r.voices[0]!.locales = ["ne-NP"])), /does not say which language/));
    it("a voice in two languages", () => rejects((r) => (r.voices.find((v) => v.id === "hf_alpha")!.locales = ["hi-IN", "ne-NP"]), /speaks hi-IN/));
    it("a Hindi voice that cannot be named", () => rejects((r) => (r.voices.find((v) => v.id === "hf_alpha")!.pickable = false), /must be nameable/));
    it("a voice with no GPL-chain statement", () => rejects((r) => (r.voices[0]!.gplChain = "Fine to ship anywhere, no restriction at all."), /GPL chain rule/));
    it("a registry with no GPL-chain rule", () => rejects((r) => (r.gplChainRule = "No rule applies to these voices at all."), /GPL-chain rule/));
    it("a licence statement left empty", () => rejects((r) => ((r.voices[0]!.licence as Record<string, string>).model = ""), /model/));
    it("a missing licence part", () => rejects((r) => delete (r.voices[0]!.licence as Record<string, string>).trainingData, /trainingData/));
    it("a model file outside tools/ or with a path trick", () => {
      rejects((r) => (r.voices[0]!.files = [{ path: "../secrets/model.onnx" }]), /files/);
      rejects((r) => (r.voices[0]!.files = [{ path: "C:/models/model.onnx" }]), /files/);
      rejects((r) => (r.voices[0]!.files = [{ path: "/etc/model.onnx" }]), /files/);
    });
    it("a hash that is not a sha256", () => rejects((r) => (r.voices[0]!.files = [{ path: "kokoro/a.onnx", sha256: "abc" }]), /sha256/));
    it("a field nobody declared", () => {
      rejects((r) => (r.voices[0]!.cleared = true), /Unrecognized key/);
      rejects((r) => (r.extra = 1), /Unrecognized key/);
    });
    it("another schema version, no voices, and values that are not a registry", () => {
      rejects((r) => (r.schema = "voices/2"), /schema/);
      rejects((r) => (r.voices = []), /voices/);
      expect(() => parseRegistry(null)).toThrow();
      expect(() => parseRegistry("voices")).toThrow();
      expect(() => parseRegistry({})).toThrow();
    });
  });
});

describe("the request's voiceName per locale (ADR 0120)", () => {
  it("keeps the English list exactly: the seven measured voices, and nothing else", () => {
    for (const v of KOKORO_VOICES) expect(parse({ voiceName: v }).success).toBe(true);
    for (const v of ["hf_alpha", "hi_IN-priyamvada-medium", "ne_NP-chitwan-medium", "en_GB-jenny_dioco-medium", "af_unknown", "../../etc/passwd", ""]) expect(parse({ voiceName: v }).success).toBe(false);
    expect(parse({ locale: "en-IN", voiceName: "af_kore", voice: "piper" }).success).toBe(true); // as before: for English the engine is not checked against the name
  });
  it("accepts only registry voices of the locale for Hindi and Nepali", () => {
    for (const v of ["hf_alpha", "hf_beta", "hm_omega", "hm_psi", "hi_IN-priyamvada-medium"]) expect(parse({ locale: "hi-IN", voiceName: v }).success).toBe(true);
    for (const v of ["af_heart", "ne_NP-chitwan-medium", "en_GB-jenny_dioco-medium", "hf_gamma"]) expect(parse({ locale: "hi-IN", voiceName: v }).success).toBe(false);
    expect(parse({ locale: "ne-NP", voiceName: "ne_NP-chitwan-medium" }).success).toBe(true);
    for (const v of ["hf_alpha", "af_heart", "hi_IN-priyamvada-medium", "ne_NP-nobody-medium"]) expect(parse({ locale: "ne-NP", voiceName: v }).success).toBe(false);
  });
  it("refuses a voice whose engine is not the one the request asks for, and a Kokoro voice for Nepali", () => {
    expect(parse({ locale: "hi-IN", voice: "kokoro", voiceName: "hi_IN-priyamvada-medium" }).success).toBe(false);
    expect(parse({ locale: "hi-IN", voice: "piper", voiceName: "hf_alpha" }).success).toBe(false);
    expect(parse({ locale: "hi-IN", voice: "kokoro", voiceName: "hf_beta" }).success).toBe(true);
    expect(parse({ locale: "hi-IN", voice: "piper", voiceName: "hi_IN-priyamvada-medium" }).success).toBe(true);
    expect(parse({ locale: "hi-IN", voice: "auto", voiceName: "hm_psi" }).success).toBe(true);
    expect(parse({ locale: "ne-NP", voice: "kokoro" }).success).toBe(false);
    expect(parse({ locale: "ne-NP", voice: "piper" }).success).toBe(true);
    expect(parse({ locale: "ne-NP" }).success).toBe(true);
    const bad = parse({ locale: "ne-NP", voice: "kokoro" });
    expect(!bad.success && bad.error.issues[0]!.message).toContain("no Kokoro voice speaks ne-NP");
  });
  it("says what is wrong in words", () => {
    expect(voiceChoiceProblem({ locale: "hi-IN", voiceName: "af_heart" })).toContain("not a voice of hi-IN");
    expect(voiceChoiceProblem({ locale: "hi-IN", voice: "piper", voiceName: "hf_alpha" })).toContain("is a kokoro voice");
    expect(voiceChoiceProblem({ locale: "hi-IN", voiceName: "hf_alpha" })).toBeUndefined();
    expect(voiceChoiceProblem({ locale: "xx-XX", voiceName: "hf_alpha" })).toContain("one of none");
  });
  it("chooses the engine: English as before, a named Hindi voice by its engine, Nepali never Kokoro", () => {
    expect(chooseEngine({ locale: "en-IN", voice: "auto" }, true)).toBe("kokoro");
    expect(chooseEngine({ locale: "en-IN", voice: "auto" }, false)).toBe("piper");
    expect(chooseEngine({ locale: "en-IN", voice: "piper" }, true)).toBe("piper");
    expect(chooseEngine({ locale: "hi-IN", voice: "auto" }, true)).toBe("kokoro");
    expect(chooseEngine({ locale: "hi-IN", voice: "auto" }, false)).toBe("piper");
    expect(chooseEngine({ locale: "hi-IN", voice: "auto", voiceName: "hi_IN-priyamvada-medium" }, true)).toBe("piper");
    expect(chooseEngine({ locale: "hi-IN", voice: "auto", voiceName: "hm_psi" }, false)).toBe("kokoro");
    expect(chooseEngine({ locale: "ne-NP", voice: "auto" }, true)).toBe("piper");
  });
});

describe("a request that does not use the new values is keyed and drawn as before", () => {
  // computed with the code of wp-a before ADR 0120 (041da28) and pinned here
  const buildKey = (options: unknown) => {
    const r = LessonRequest.parse({ ...base, options });
    return stageKey("build", { kind: "story", source: undefined, story: sanitizeStory(r.story).story, voice: r.options.voice === "auto" ? "kokoro" : r.options.voice, theme: r.options.theme, options: storyOutputOptions(r.options), v: 3 });
  };
  it("has the same build key", () => {
    expect(buildKey({})).toBe("fbcab4662034ffe0529d304a3b336fc12b1a8965ecce08d8d7c97b05bc609262");
    expect(buildKey({ voiceName: "af_kore" })).toBe("9565be4248446492ed64b07bb7c407c440c5d9f81cd2e87f6076c66d8aa8662b");
    expect(buildKey({ style: "animated" })).toBe("5c85061e0ffd79e99fd1b5158aef001167d863142601f010ed4e6051d044d3a5");
    expect(buildKey({ locale: "hi-IN", spokenMath: "hinglish" })).toBe("e8cf43f961390921f9da07ec8f32a5ab3746dd28fc3692779ff4e409f237a7fb");
    expect(buildKey({ locale: "ne-NP" })).toBe("52eb2feb3882095b95a2ff28f92bb41aa87c5218f723d87616ae04e9c9dd167c");
  });
  const placed = placeStory(sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["One thing.", "Two things."], visuals: [{ id: "c", kind: "circle", cx: 20, cy: 10, r: 2, in: { s: 0, off: 0 } }] }] }).story!, [[2000, 2000]]);
  const sha = (html: string) => createHash("sha256").update(html.replace(/file:\/\/\/[^"')]*\/(packages\/[^"')]*)/g, "$1")).digest("hex");
  it("draws an English page to the same bytes", () => {
    expect(sha(storyPageHtml(placed, "whiteboard", {}, "runtime();", "file:///k.css", { visualStyle: "technical", locale: "en-IN" }))).toBe("a50e17eaa44e8b38f335f45bdf27ad92fa26b29e50850bbc68e6969720bcb03b");
    expect(sha(storyPageHtml(placed, "whiteboard", {}, "runtime();", "file:///k.css", { visualStyle: "animated", locale: "en-IN", chrome: "none", font: "atkinson" }))).toBe("33e3497bf16ae6add5d4ade1f41301270544ae45b2a5d239f5904969a7516696");
    expect(sha(storyPageHtml(placed, "dark", {}, "runtime();", "file:///k.css", { visualStyle: "animated", locale: "en-IN", captions: "none" }))).toBe("7829645cd00380cd5c9cf0137c8990d403b5fd5eee84a422869b6a53f87f8d9a");
  });
});

describe("a Hindi or Nepali page uses the engine's own Devanagari font and fetches nothing (ADR 0120)", () => {
  const placed = placeStory(sanitizeStory({ title: "शीर्षक", scenes: [{ heading: "भाग", sentences: ["पहला वाक्य।", "दूसरा वाक्य।"], visuals: [] }] }).story!, [[2000, 2000]]);
  for (const locale of ["hi-IN", "ne-NP"] as const) {
    for (const visualStyle of ["technical", "animated"] as const) {
      it(`${locale}, ${visualStyle}: local Noto faces, no Google link, no remote URL`, () => {
        const html = storyPageHtml(placed, "whiteboard", {}, "runtime();", "file:///k.css", { visualStyle, locale });
        expect(html).not.toMatch(/googleapis|gstatic|https?:\/\//);
        for (const f of ["noto-sans-devanagari-deva-400.woff2", "noto-sans-devanagari-deva-500.woff2", "noto-sans-devanagari-latin-400.woff2", "noto-sans-devanagari-latin-500.woff2"]) {
          expect(html).toContain(f);
          expect(existsSync(join(__dirname, "../../components/fonts", f))).toBe(true);
        }
        expect(html).toContain("unicode-range:U+0900-097F");
        expect(html).toContain("font-synthesis:none");
        expect(html).toContain(`lang="${locale === "hi-IN" ? "hi" : "ne"}"`);
      });
    }
  }
});

describe("the voices of the registry in the adapters", () => {
  const tmp = mkdtempSync(join(tmpdir(), "eve-voices-"));
  const kokoroTools = () => {
    const files = { worker: join(tmp, "w.cjs"), model: join(tmp, "m.onnx"), voices: join(tmp, "v.bin") };
    for (const f of Object.values(files)) writeFileSync(f, "x");
    return { python: process.execPath, pythonArgs: [] as string[], ...files };
  };
  for (const v of VOICE_REGISTRY.voices.filter((x) => x.engine === "kokoro")) {
    it(`the Kokoro manifest of ${v.id} is development-only, as the registry says, and the production guard refuses it`, () => {
      const s = kokoroSynthesizer(kokoroTools(), { voice: v.id });
      expect(s.voice.id).toBe(`kokoro:${v.id}`);
      expect(s.voice.status).toBe(v.status);
      expect(isAllowedForUse(s.voice.id, "production")).toBe(false);
      expect(() => requireCleared({ id: s.voice.id, status: s.voice.status })).toThrow(/cannot be used in a production build/);
      // the language of the phonemiser follows the voice: hi for h*, en-us for a*
      expect(s.cacheParts!.lang).toBe(v.locales[0] === "hi-IN" ? "hi" : "en-us");
    });
  }
  for (const v of VOICE_REGISTRY.voices.filter((x) => x.engine === "piper" && x.pickable)) {
    it(`the Piper manifest of ${v.id} is development-only, carries the registry's licence statements, and is refused in production`, () => {
      const root = mkdtempSync(join(tmp, "root-"));
      mkdirSync(join(root, "tools", "piper", "models"), { recursive: true });
      const spec = piperLangModel(root, v.locales[0]!, v.id);
      expect(spec.voiceName).toBe(v.id);
      expect(spec.model.replace(/\\/g, "/")).toContain(v.files.find((f) => f.path.endsWith(".onnx"))!.path);
      writeFileSync(spec.model, "m");
      writeFileSync(spec.config, "{}");
      const s = piperLangSynthesizer("piper.exe", spec);
      expect(s.voice.status).toBe("development-only");
      expect(s.voice.licences.model).toBe(v.licence.model);
      expect(s.voice.licences.engine).toBe(v.licence.engine);
      expect(() => requireCleared({ id: s.voice.id, status: s.voice.status })).toThrow(/cannot be used in a production build/);
      expect(isAllowedForUse(s.voice.id, "production")).toBe(false);
    });
  }
  it("a locale or a voice that is not in the registry has no Piper model", () => {
    expect(() => piperLangModel("/x", "fr-FR")).toThrow(/no piper model configured for locale "fr-FR"/);
    expect(() => piperLangModel("/x", "hi-IN", "ne_NP-chitwan-medium")).toThrow(/and voice "ne_NP-chitwan-medium"/);
    expect(piperLangModel("/x", "hi-IN").voiceName).toBe("hi_IN-priyamvada-medium");
    expect(piperLangModel("/x", "ne-NP").voiceName).toBe("ne_NP-chitwan-medium");
  });
});

describe("the sample requests for native listeners (fixtures/voices)", () => {
  const dir = join(__dirname, "../../../fixtures/voices");
  const cases: Array<[string, string, string, string]> = [
    ["hi-kokoro", "hi-IN", "kokoro", "hf_alpha"],
    ["hi-piper", "hi-IN", "piper", "hi_IN-priyamvada-medium"],
    ["ne-piper", "ne-NP", "piper", "ne_NP-chitwan-medium"],
  ];
  for (const [name, locale, voice, voiceName] of cases) {
    it(`${name} is a valid ${locale} request that names its registry voice`, () => {
      const r = LessonRequest.parse(JSON.parse(readFileSync(join(dir, `${name}.request.json`), "utf8")));
      expect(r.options).toMatchObject({ locale, voice, voiceName, style: "animated", qa: "strict" });
      expect(isAllowedForUse(voiceName, "review")).toBe(true);
      const story = sanitizeStory(r.story).story!;
      const sentences = story.scenes.flatMap((s) => s.sentences);
      expect(sentences.length).toBeGreaterThanOrEqual(4);
      expect(sentences.length).toBeLessThanOrEqual(6);
      expect(sentences.every((s) => /[ऀ-ॿ]/.test(s.text))).toBe(true); // written in Devanagari
      expect(JSON.stringify(r.story)).not.toMatch(/NCERT|CBSE|ICSE|Pearson|Oxford|Cambridge|Arihant|Siyavula/i); // no board or publisher named in the story
    });
  }
  it("a sample with a voice of another language is refused", () => {
    const r = JSON.parse(readFileSync(join(dir, "hi-kokoro.request.json"), "utf8"));
    r.options.voiceName = "ne_NP-chitwan-medium";
    expect(LessonRequest.safeParse(r).success).toBe(false);
  });
});
