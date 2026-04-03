import { randomUUID } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';

const HOST = process.env.AUTOMATCH_LOG_HOST ?? '127.0.0.1';
const PORT = Number(process.env.AUTOMATCH_LOG_PORT ?? '8787');
const STORAGE_DIR = resolve(process.env.AUTOMATCH_LOG_STORAGE_DIR ?? './server-data/auto-match-logs');
const MAX_BODY_BYTES = Number(process.env.AUTOMATCH_LOG_MAX_BODY_BYTES ?? `${1024 * 1024}`);
const RATE_LIMIT_PER_MINUTE = Number(process.env.AUTOMATCH_LOG_RATE_LIMIT_PER_MINUTE ?? '30');
const ALLOWED_ORIGINS = (process.env.AUTOMATCH_LOG_ALLOWED_ORIGINS ?? '*')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const requestTimestamps = new Map();

function setCorsHeaders(response, origin) {
  const allowAny = ALLOWED_ORIGINS.includes('*');
  const allowedOrigin = allowAny ? '*' : origin && ALLOWED_ORIGINS.includes(origin) ? origin : null;
  if (allowedOrigin) {
    response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function sendJson(response, statusCode, payload, origin) {
  setCorsHeaders(response, origin);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload, null, 2));
}

function getClientKey(request) {
  return `${request.headers['x-forwarded-for'] ?? request.socket.remoteAddress ?? 'unknown'}`;
}

function isRateLimited(clientKey) {
  const now = Date.now();
  const recent = (requestTimestamps.get(clientKey) ?? []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= RATE_LIMIT_PER_MINUTE) {
    requestTimestamps.set(clientKey, recent);
    return true;
  }

  recent.push(now);
  requestTimestamps.set(clientKey, recent);
  return false;
}

function sanitizeSegment(value) {
  const normalized = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.slice(0, 96) || randomUUID().slice(0, 8);
}

async function collectBody(request) {
  const chunks = [];
  let totalLength = 0;

  for await (const chunk of request) {
    totalLength += chunk.length;
    if (totalLength > MAX_BODY_BYTES) {
      throw new Error(`Payload exceeded ${MAX_BODY_BYTES} bytes.`);
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return 'Request body must be a JSON object.';
  }
  if (payload.schemaVersion !== 1) {
    return 'Unsupported schemaVersion.';
  }
  if (typeof payload.matchId !== 'string' || payload.matchId.length === 0) {
    return 'matchId is required.';
  }
  if (typeof payload.savedAt !== 'string' || payload.savedAt.length === 0) {
    return 'savedAt is required.';
  }
  if (payload.source !== 'gungi-web') {
    return 'source must be gungi-web.';
  }
  if (!payload.summary || typeof payload.summary !== 'object') {
    return 'summary is required.';
  }
  if (!payload.finalState || typeof payload.finalState !== 'object') {
    return 'finalState is required.';
  }
  if (!Array.isArray(payload.finalState.history)) {
    return 'finalState.history must be an array.';
  }
  return null;
}

async function fileExists(pathname) {
  try {
    await access(pathname);
    return true;
  } catch {
    return false;
  }
}

async function savePayload(payload, request) {
  const id = sanitizeSegment(payload.matchId);
  const targetPath = join(STORAGE_DIR, `${id}.json`);
  const updatedExisting = await fileExists(targetPath);
  const envelope = {
    savedAt: new Date().toISOString(),
    request: {
      forwardedFor: request.headers['x-forwarded-for'] ?? null,
      origin: request.headers.origin ?? null,
      remoteAddress: request.socket.remoteAddress ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    },
    payload,
  };

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(envelope, null, 2));
  return {
    id,
    savedAt: envelope.savedAt,
    updatedExisting,
  };
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin ?? null;
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${HOST}:${PORT}`}`);

  if (request.method === 'OPTIONS') {
    setCorsHeaders(response, origin);
    response.writeHead(204);
    response.end();
    return;
  }

  if (url.pathname === '/api/auto-match-logs/health' && request.method === 'GET') {
    sendJson(
      response,
      200,
      {
        ok: true,
        storageDir: STORAGE_DIR,
      },
      origin,
    );
    return;
  }

  if (url.pathname !== '/api/auto-match-logs' || request.method !== 'POST') {
    sendJson(
      response,
      404,
      {
        error: 'Not found.',
      },
      origin,
    );
    return;
  }

  if (isRateLimited(getClientKey(request))) {
    sendJson(
      response,
      429,
      {
        error: 'Rate limit exceeded.',
      },
      origin,
    );
    return;
  }

  try {
    const raw = await collectBody(request);
    const payload = JSON.parse(raw);
    const validationError = validatePayload(payload);
    if (validationError) {
      sendJson(
        response,
        400,
        {
          error: validationError,
        },
        origin,
      );
      return;
    }

    const result = await savePayload(payload, request);
    console.log(`[auto-match-log-server] saved ${result.id}.json`);
    sendJson(
      response,
      result.updatedExisting ? 200 : 201,
      {
        id: result.id,
        ok: true,
        savedAt: result.savedAt,
        updatedExisting: result.updatedExisting,
      },
      origin,
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(
        response,
        400,
        {
          error: 'Request body must be valid JSON.',
        },
        origin,
      );
      return;
    }

    sendJson(
      response,
      500,
      {
        error: error instanceof Error ? error.message : 'Unexpected server error.',
      },
      origin,
    );
  }
});

await mkdir(STORAGE_DIR, { recursive: true });
server.listen(PORT, HOST, () => {
  console.log(`[auto-match-log-server] listening on http://${HOST}:${PORT}`);
  console.log(`[auto-match-log-server] writing logs to ${STORAGE_DIR}`);
});
