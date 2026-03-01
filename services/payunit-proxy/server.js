'use strict';

const http = require('node:http');

const PORT = Number.parseInt(process.env.PORT || '8080', 10);
const PROXY_SHARED_SECRET = (process.env.PROXY_SHARED_SECRET || '').trim();
const PAYUNIT_API_USER = (process.env.PAYUNIT_API_USER || '').trim();
const PAYUNIT_API_PASSWORD = (process.env.PAYUNIT_API_PASSWORD || '').trim();
const PAYUNIT_API_KEY = (process.env.PAYUNIT_API_KEY || '').trim();
const PAYUNIT_BASE_URL = (process.env.PAYUNIT_BASE_URL || 'https://gateway.payunit.net').trim();

function resolveMode(apiKey, configuredMode) {
  const normalized = (configuredMode || '').trim().toLowerCase();

  if (normalized === 'live' || normalized === 'test') {
    return normalized;
  }

  if (apiKey.startsWith('live_')) {
    return 'live';
  }

  if (apiKey.startsWith('test_')) {
    return 'test';
  }

  return 'test';
}

const PAYUNIT_MODE = resolveMode(PAYUNIT_API_KEY, process.env.PAYUNIT_MODE);

function hasRequiredConfig() {
  return Boolean(
    PROXY_SHARED_SECRET &&
      PAYUNIT_API_USER &&
      PAYUNIT_API_PASSWORD &&
      PAYUNIT_API_KEY
  );
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = '';

    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;

      if (raw.length > 1024 * 1024) {
        reject(new Error('Request body too large.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    request.on('error', reject);
  });
}

function buildPayunitHeaders() {
  const basic = Buffer.from(`${PAYUNIT_API_USER}:${PAYUNIT_API_PASSWORD}`).toString(
    'base64'
  );

  return {
    Accept: 'application/json',
    Authorization: `Basic ${basic}`,
    'x-api-key': PAYUNIT_API_KEY,
    mode: PAYUNIT_MODE,
  };
}

function buildProxyPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/api/gateway/')) {
    return null;
  }

  return path;
}

function summarizeError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

async function handleProxy(request, response) {
  if (!hasRequiredConfig()) {
    sendJson(response, 500, {
      error:
        'PROXY_SHARED_SECRET, PAYUNIT_API_USER, PAYUNIT_API_PASSWORD, and PAYUNIT_API_KEY must be configured.',
    });
    return;
  }

  const authorization = request.headers.authorization || '';
  if (authorization !== `Bearer ${PROXY_SHARED_SECRET}`) {
    sendJson(response, 401, { error: 'Unauthorized' });
    return;
  }

  let payload;

  try {
    payload = await readJson(request);
  } catch (error) {
    sendJson(response, 400, { error: summarizeError(error) });
    return;
  }

  const upstreamPath = buildProxyPath(payload.path);
  const method = typeof payload.method === 'string' ? payload.method.toUpperCase() : 'GET';

  if (!upstreamPath) {
    sendJson(response, 400, { error: 'Unsupported PayUnit path.' });
    return;
  }

  if (method !== 'GET' && method !== 'POST') {
    sendJson(response, 400, { error: 'Unsupported HTTP method.' });
    return;
  }

  const headers = buildPayunitHeaders();
  let body;

  if (method === 'POST' && payload.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(payload.body);
  }

  const upstreamUrl = new URL(upstreamPath, PAYUNIT_BASE_URL).toString();

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers,
      body,
    });
    const text = await upstreamResponse.text();
    const contentType =
      upstreamResponse.headers.get('content-type') || 'text/plain; charset=utf-8';

    response.writeHead(upstreamResponse.status, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    });
    response.end(text);
  } catch (error) {
    console.error('PayUnit proxy upstream request failed', {
      method,
      upstreamPath,
      error: summarizeError(error),
    });

    sendJson(response, 502, { error: 'Upstream PayUnit request failed.' });
  }
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 404, { error: 'Not found' });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, {
      ok: true,
      mode: PAYUNIT_MODE,
      payunitBaseUrl: PAYUNIT_BASE_URL,
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/proxy') {
    await handleProxy(request, response);
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PayUnit proxy listening on port ${PORT}`);
});
