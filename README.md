# Project Space

Scroll-driven 3D launch hero built with Vite + Three.js.

`npm install && npm run dev`

Flow: 3-2-1 countdown loader → scroll to ignite → liftoff from the pad → climb through clouds →
leave the atmosphere → Earth below → blast → "Project Space" card.

Debug: `?skip` skips the countdown, `?p=0.5` renders a fixed scroll position (0–1).
Timeline constants live in `src/main.js` (`T`); scene pieces are in `src/rocket.js`, `src/environment.js`, `src/particles.js`.
