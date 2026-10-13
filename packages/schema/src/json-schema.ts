import { zodToJsonSchema } from "zod-to-json-schema";
import { LessonBundle, SceneSpec, LessonPlan, NarrationSentence } from "./bundle";
import { Timeline, AudioTrack } from "./timeline";

/** JSON Schemas for the runtime LLM prompts (planner, scriptwriter, composer) and for other languages (the verifier). */
export const jsonSchemas = () => ({
  LessonBundle: zodToJsonSchema(LessonBundle, "LessonBundle"),
  LessonPlan: zodToJsonSchema(LessonPlan, "LessonPlan"),
  NarrationSentence: zodToJsonSchema(NarrationSentence, "NarrationSentence"),
  SceneSpec: zodToJsonSchema(SceneSpec, "SceneSpec"),
  Timeline: zodToJsonSchema(Timeline, "Timeline"),
  AudioTrack: zodToJsonSchema(AudioTrack, "AudioTrack"),
});
