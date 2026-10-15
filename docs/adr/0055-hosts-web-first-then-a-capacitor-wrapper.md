# ADR 0055: Hosts: web first, then a Capacitor wrapper

Status: accepted (owner accepted 2026-10-16). Docs only; no code changes with it.

## Context
YourTutor ships as a web app (phone and desktop browsers) and is meant to ship as a phone application. An engine lesson is played by the player with the DOM, SVG and Web Audio. The engine package is static files and is the same for every host (`docs/ENGINE_INTERFACE.md`).

## Decision
- The **web app comes first**: responsive, installable as a PWA. It is the host in which INT is built and tested.
- The **phone application comes later as a Capacitor wrapper** around the same web app, carrying the same engine package.
- **Lessons are never rebuilt as native screens.** The player needs a browser engine for the DOM, SVG and Web Audio; a native rewrite would be a second renderer to keep identical to the first, which the single-renderer principle (`docs/ENGINE_ARCHITECTURE.md` section 9) rules out.
- The package is the same for every host. Only the slot (the container the host gives) and the layout rules around it differ.

## Consequences
- The lesson location is an http(s) URL or an app-local URL; the player must not assume either.
- Lesson correctness never depends on a service worker. Offline caching is a host concern: a service worker on the web, the app's file storage in the wrapper (iOS WebViews do not provide service workers except for a few app-bound domains).
- The player treats an AudioContext state of `interrupted` (WebKit) like `suspended`.
- How the wrapper downloads and stores lesson packages is an open point, decided at INT.
- The browser floor the build targets is proposed in `docs/ENGINE_INTERFACE.md` section 4: Chrome and Android WebView 100, Safari 15.4 (dynamic viewport units), Firefox 100. It is decided by its own ADR.
- Engines are measured on Chromium, Firefox and WebKit at phone, tablet and desktop sizes (WP2e).
