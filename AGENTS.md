# Astra engineering contract

- Keep the browser runtime in `src/engine`, untrusted generation in `src/generator`, protocol validation in `src/core`.
- Authors export `buildPlanet(context)` using provided Three.js. Never execute author modules in the main window.
- A planet version is pinned to a Git commit, verified SHA-256 and at most 5,000,000 uncompressed bytes.
- World coordinates are absolute doubles; render positions are player-relative. Ordinary flight never changes scenes or teleports.
- A warp commits its destination only after generation, hydration, texture upload and shader preparation complete.
- Validate all messages and serialized content before Three.js parsing. No network URLs in generated data.
- Dispose geometries, textures, materials, workers and listeners when their lifetime ends.
- Use strict TypeScript. Keep pure flight/loading decisions independent of rendering and covered by tests.
- Run `npm run check` and `npm run test:e2e` before publishing changes to runtime or protocol.
- Never commit credentials, dependency folders or browser test artifacts.
- Update `docs/PROTOCOL.md` whenever the author contract changes.
