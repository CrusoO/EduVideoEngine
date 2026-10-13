# ADR 0004: hashes are computed over a canonical serialization

Status: accepted. Folds the zod-defaults finding (ADR 0003) into a general rule.

A hash is computed over a canonical serialization, never over whatever a parser emits: UTF-8; strings and object keys
NFC-normalised; keys sorted; no whitespace; undefined dropped; -0 written as 0; NaN and Infinity refused. Exact
quantities are rationals (`num` with `n` and `d`), never floats; props may hold plain numbers. Any second writer
(Python verifier, a Rust tool, an editor) must reproduce these bytes. Guarded by tests: composed and decomposed
Latin and Devanagari strings hash the same, key order never matters, the parsed bundle hashes like the authored one.
