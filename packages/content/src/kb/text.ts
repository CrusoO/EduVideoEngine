const STOP = new Set(["a", "an", "the", "of", "to", "in", "on", "and", "or", "for", "from", "with", "how", "what", "is", "are", "was", "were", "be", "it", "its", "that", "this", "as", "at", "by", "can", "do", "does", "me", "explain", "teach", "about", "find", "show", "tell", "than", "then", "when", "which", "has", "have", "not", "only", "same", "each"]);

/** A light stem, enough to match "roots" with "root" and "resistors" with "resistor". Not a language model: the matching it supports is lexical. */
export const stem = (w: string): string => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w.replace(/s$/, ""));
export const words = (s: string): string[] => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w) && w.length > 1);
export const stems = (s: string): string[] => words(s).map(stem);
