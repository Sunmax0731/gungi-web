# Auto-Match Log Server

## Goal

Completed CPU-vs-CPU matches can be POSTed from the browser to a separate HTTP endpoint and stored as JSON files.

GitHub Pages cannot host that write endpoint, so the production flow is:

1. Run or deploy the Node log server separately.
2. Build this frontend with `VITE_AUTOMATCH_LOG_ENDPOINT` pointing at that server.
3. Publish the generated static assets as usual.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_AUTOMATCH_LOG_ENDPOINT=http://127.0.0.1:8787/api/auto-match-logs`.
3. Start the server with `npm run logs:server`.
4. Start the client with `npm run dev`.

Health check:

```bash
curl http://127.0.0.1:8787/api/auto-match-logs/health
```

Saved files are written to `server-data/auto-match-logs` by default.

## Endpoint contract

- `POST /api/auto-match-logs`
- `Content-Type: application/json`
- body: `AutoMatchLogPayload` from `src/game/autoMatchLog.ts`

Response example:

```json
{
  "id": "2026-04-03T09-00-00.000Z",
  "ok": true,
  "savedAt": "2026-04-03T09:05:12.345Z",
  "updatedExisting": false
}
```

## Notes

- The server overwrites the same file when the same `matchId` is re-uploaded.
- CORS, body-size limit, and a simple in-memory rate limit are configurable via environment variables.
- If `VITE_AUTOMATCH_LOG_ENDPOINT` is unset, the browser UI shows that remote saving is disabled.
