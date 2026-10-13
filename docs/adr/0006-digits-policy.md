# ADR 0006: digit policy is per locale (default pending native review)

Status: accepted as a default; needs native-reviewer confirmation.

Hindi and Nepali show Latin digits on screen by default (NCERT Hindi-medium maths uses them; machine translation
preserves them). Stored per locale in the registry (`digits: "latin" | "devanagari"`, `digitsStatus`), so a
curriculum can override it without a code change. The spoken form is always words from the verbaliser, whatever the
digit style. `digitsStatus: "default-pending-native-review"` is explicit in the registry. It is a curriculum call.
