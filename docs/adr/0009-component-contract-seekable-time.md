# ADR 0009: components are a pure function of (el, props, t, ctx)

Status: accepted (step b). Step (c) resolver tests are written against this.

`render(el, props, t, ctx)` draws the object as it looks at lesson time `t` (ms). It is pure and idempotent: same
arguments, same DOM, in any order, including seeking backwards. No timers, no clock, no randomness. A component never
sees a cue or a sentence: the resolver gives it only its own resolved events (`{action, atMs, holdUntilMs}`), and
`objectStateAt(events, t)` turns those into opacity, highlight strength and dimming. Tested in jsdom (idempotence per
component) and in Chromium (identical pixels after seeking away and back). `verify(props, ctx)` returns problems;
an empty array means verified.
