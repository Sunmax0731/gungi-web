# Gungi Web

Browser-based Gungi implementation built with React, TypeScript, Vite, and react-three-fiber.

## Development

```bash
npm install
npm run dev
```

## Quality checks

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

`test:e2e` launches Playwright against a local Vite server and covers the main UI flow, auto-match progression, and save/restore behavior.

## Deployment flow

This repository is the source of truth for the game code.

1. Build this repository with `npm run build`.
2. Copy `dist` into `D:\\Claude\\docs\\gungi`.
3. Commit and push the changes from `D:\\Claude\\docs` to publish `https://sunmax0731.github.io/gungi/`.

The published site is maintained in the separate Pages repository, so built assets should not be committed here.
