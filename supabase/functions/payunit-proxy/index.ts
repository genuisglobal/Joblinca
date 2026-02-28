import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

declare const Deno: {
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};

interface ProxyRequest {
  path?: string;
  method?: string;
  body?: unknown;
}

function jsonResponse(payload: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function getRequiredHeader(request: Request, name: string): string | null {
  const value = request.headers.get(name);
  if (!value) {
    return null;
  }

  return value;
}

function isAllowedBaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname === 'gateway.payunit.net';
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let payload: ProxyRequest;

  try {
    payload = (await request.json()) as ProxyRequest;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const path = payload.path || '';
  const method = (payload.method || 'GET').toUpperCase();

  if (!path.startsWith('/api/gateway/')) {
    return jsonResponse({ error: 'Unsupported PayUnit path' }, 400);
  }

  if (method !== 'GET' && method !== 'POST') {
    return jsonResponse({ error: 'Unsupported HTTP method' }, 400);
  }

  const apiUser = getRequiredHeader(request, 'x-payunit-api-user');
  const apiPassword = getRequiredHeader(request, 'x-payunit-api-password');
  const apiKey = getRequiredHeader(request, 'x-payunit-api-key');
  const mode = getRequiredHeader(request, 'x-payunit-mode') || 'test';
  const baseUrl =
    getRequiredHeader(request, 'x-payunit-base-url') || 'https://gateway.payunit.net';

  if (!apiUser || !apiPassword || !apiKey) {
    return jsonResponse({ error: 'Missing PayUnit credentials' }, 400);
  }

  if (!isAllowedBaseUrl(baseUrl)) {
    return jsonResponse({ error: 'Unsupported PayUnit base URL' }, 400);
  }

  const basic = btoa(`${apiUser}:${apiPassword}`);
  const upstreamHeaders: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Basic ${basic}`,
    'x-api-key': apiKey,
    mode,
  };

  let upstreamBody: string | undefined;
  if (method === 'POST' && payload.body !== undefined) {
    upstreamHeaders['Content-Type'] = 'application/json';
    upstreamBody = JSON.stringify(payload.body);
  }

  const upstreamUrl = new URL(path, baseUrl).toString();

  try {
    const response = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders,
      body: upstreamBody,
    });
    const text = await response.text();
    const contentType =
      response.headers.get('content-type') || 'text/plain; charset=utf-8';

    return new Response(text, {
      status: response.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (error) {
    console.error('PayUnit proxy request failed', {
      path,
      method,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return jsonResponse({ error: 'PayUnit proxy request failed' }, 502);
  }
});
