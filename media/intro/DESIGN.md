# M9 intro design

## Intent

Six-second, silent, 1920×1080 motion graphic for the family-tree desktop
application. It is a separate onboarding/marketing artifact and is never loaded
into the Electron runtime.

## Storyboard

| Time | Beat | Motion |
| --- | --- | --- |
| 0.0–0.8 s | calm paper field | soft ambient gradients establish the palette |
| 0.2–1.4 s | title | eyebrow, title and subtitle fade/slide upward |
| 0.8–2.3 s | first branch | parent card appears as its connector draws |
| 1.4–2.8 s | second branch | partner card and dashed partnership connector follow |
| 2.1–3.0 s | convergence | child card enters from the right |
| 3.0–6.0 s | hold | subtle camera breathing, all relationships readable |

## Visual contract

- anonymized labels only: `Родитель`, `Партнёр`, `Ребёнок`;
- no project file, photos, user names, addresses, or runtime state;
- palette follows the app reference: paper, ink, sage, rose, blue;
- connectors terminate at card geometry and remain legible throughout the hold;
- motion is deterministic and seekable through a paused GSAP timeline registered
  in `window.__timelines`.

## Rendering

The composition is authored as plain HTML/CSS with HyperFrames timing attributes.
The MP4 is rendered outside the application runtime with the HyperFrames CLI and
FFmpeg. Run `npm run check` before `npm run render`.
