# ADR 0057: Browser support floor

Status: accepted (owner accepted 2026-10-16).

## Context
The engine package and player are built with web platform features that require a minimum browser version. The floor must cover the primary host (web app on phone and desktop) and the planned Capacitor wrapper (ADR 0055). Dynamic viewport units (`dvh`), the `AudioContext` interrupted state, and the CSS used by the layout require Safari 15.4 at minimum.

## Decision
The build targets and tests assume these minimum browser versions:

| Browser / runtime | Minimum version | Key reason |
| --- | --- | --- |
| Chrome (desktop and Android) | 100 | Stable `dvh` and `AudioContext.resume()` behaviour |
| Android WebView (Capacitor wrapper) | 100 | Same Chromium base as Chrome |
| Safari (iOS and macOS) | 15.4 | `dvh` units (shipped in 15.4) |
| Firefox | 100 | `dvh` units and `AudioContext` |

## Consequences
- The TypeScript and CSS build targets are set to match this floor; anything requiring a higher version needs an ADR amendment or a polyfill.
- Playwright matrix projects (Chromium, Firefox, WebKit at six viewports) cover the floor as closely as the available Playwright browser builds allow.
- WebKit on Windows in the Playwright build lacks `AudioContext`; real Safari on an iPhone needs a device run before any pilot (recorded in the matrix measurement, 2026-10-15).
- ADR 0055 references this floor and is updated to "accepted" alongside it.
- The proposed floor that appeared in `docs/ENGINE_INTERFACE.md` section 4 is now decided by this ADR.
