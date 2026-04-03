# Gungi Web

React + TypeScript + Vite based browser implementation of Gungi.

## Main features

- Beginner / advanced rulesets
- Human vs CPU and CPU vs CPU modes
- Replay controls and match log review
- Local autosave, manual save slots, export / import
- Hint display backed by the same CPU search pipeline
- Optional remote upload of completed auto-match logs

## Local development

```bash
npm install
npm run dev
```

If you want remote auto-match log uploads while developing, create `.env.local` from `.env.example` and run:

```bash
npm run logs:server
```

The local log server listens on `http://127.0.0.1:8787` by default.

## Quality checks

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

`test:e2e` launches Playwright against a local Vite server and covers the main UI flow, auto-match progression, replay controls, and save / restore behavior.

## Deployment flow

This repository is the source of truth for application code.

1. Build with `npm run build`.
2. Copy `dist` into `D:\\Claude\\docs\\gungi`.
3. Commit and push `D:\\Claude\\docs` to publish `https://sunmax0731.github.io/gungi/`.

GitHub Pages only serves static files, so remote auto-match log saving requires a separate HTTP endpoint. The browser upload stays disabled unless `VITE_AUTOMATCH_LOG_ENDPOINT` is set at build time.

## Reference

- `guides/architecture.md`
- `guides/auto-match-log-server.md`
