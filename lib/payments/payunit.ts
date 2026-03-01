/**
 * Payunit REST API integration for MTN MoMo & Orange Money payments.
 *
 * Base URL:
 *   - https://gateway.payunit.net
 *
 * Auth: Basic (API user + API password) + x-api-key (application token) + mode header.
 *
 * Environment variables:
 *   PAYUNIT_API_USER
 *   PAYUNIT_API_PASSWORD
 *   PAYUNIT_API_KEY
 *   PAYUNIT_MODE        - test | live (defaults to test)
 *   PAYUNIT_BASE_URL    - defaults to https://gateway.payunit.net
 *   PAYUNIT_PROXY_URL   - optional external fixed-IP proxy base URL
 *   PAYUNIT_PROXY_SHARED_SECRET - shared secret for the external proxy
 *   PAYUNIT_USE_SUPABASE_PROXY  - optional fallback proxy flag
 *   PAYUNIT_DEFAULT_GATEWAY (optional)
 */

type PayunitMode = 'test' | 'live';

interface PayunitConfig {
  apiUser: string;
  apiPassword: string;
  apiKey: string;
  mode: PayunitMode;
  baseUrl: string;
  externalProxyUrl: string | null;
  externalProxySecret: string | null;
  supabaseProxyEnabled: boolean;
  supabaseProxyUrl: string | null;
  supabaseProxyAuthToken: string | null;
}

interface PayunitEnvelope<T> {
  status?: string;
  statusCode?: number;
  message?: string;
  data: T;
}

export interface PayunitProvider {
  shortcode: string;
  name: string;
  logo?: string;
  required_field?: string[];
}

export interface InitializePaymentParams {
  amount: number;
  currency?: string;
  transactionId: string;
  returnUrl: string;
  notifyUrl?: string;
  paymentCountry?: string;
}

export interface InitializePaymentResponse {
  transaction_id: string;
  transaction_url?: string;
  providers?: PayunitProvider[];
}

export interface MakePaymentParams {
  amount: number;
  currency?: string;
  transactionId: string;
  phoneNumber: string;
  returnUrl: string;
  notifyUrl?: string;
  gateway: string;
  paymentType?: 'button';
}

export interface MakePaymentResponse {
  transaction_id: string;
  payment_status?: string;
  t_id?: string;
  gateway?: string;
  currency?: string;
}

export interface PaymentStatusResponse {
  transaction_id?: string;
  transaction_status?: string;
  gateway?: string;
  currency?: string;
  amount?: string;
}

export interface PayunitRuntimeInfo {
  mode: PayunitMode;
  baseUrl: string;
  proxyEnabled: boolean;
  proxyConfigured: boolean;
  proxyInUse: boolean;
  proxyTarget: 'none' | 'external' | 'supabase';
}

function resolveMode(
  apiKey: string,
  configuredMode?: string
): PayunitMode {
  const normalized = (configuredMode || '').toLowerCase();

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

function readBooleanEnv(value?: string): boolean {
  const normalized = (value || '').replace(/\\r|\\n/g, '').trim().toLowerCase();
  return normalized === 'true';
}

function normalizeProxyUrl(value?: string): string | null {
  const normalized = (value || '').trim();
  if (!normalized) {
    return null;
  }

  return normalized.replace(/\/+$/, '');
}

function getConfig(): PayunitConfig {
  const apiUser = process.env.PAYUNIT_API_USER;
  const apiPassword = process.env.PAYUNIT_API_PASSWORD;
  const apiKey = process.env.PAYUNIT_API_KEY;
  const mode = resolveMode(apiKey || '', process.env.PAYUNIT_MODE);
  const baseUrl = process.env.PAYUNIT_BASE_URL || 'https://gateway.payunit.net';
  const externalProxyUrl = normalizeProxyUrl(process.env.PAYUNIT_PROXY_URL);
  const externalProxySecret =
    (process.env.PAYUNIT_PROXY_SHARED_SECRET || '').trim() || null;
  const supabaseProxyEnabled = readBooleanEnv(process.env.PAYUNIT_USE_SUPABASE_PROXY);
  const supabaseProxyUrl = deriveSupabaseProxyUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseProxyAuthToken = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

  if (!apiUser || !apiPassword || !apiKey) {
    throw new Error(
      'PAYUNIT_API_USER, PAYUNIT_API_PASSWORD, and PAYUNIT_API_KEY must be configured.'
    );
  }

  if (Boolean(externalProxyUrl) !== Boolean(externalProxySecret)) {
    throw new Error(
      'PAYUNIT_PROXY_URL and PAYUNIT_PROXY_SHARED_SECRET must be configured together.'
    );
  }

  return {
    apiUser,
    apiPassword,
    apiKey,
    mode,
    baseUrl,
    externalProxyUrl,
    externalProxySecret,
    supabaseProxyEnabled,
    supabaseProxyUrl,
    supabaseProxyAuthToken,
  };
}

function headers(config: PayunitConfig): Record<string, string> {
  const basic = Buffer.from(`${config.apiUser}:${config.apiPassword}`).toString(
    'base64'
  );

  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Basic ${basic}`,
    'x-api-key': config.apiKey,
    mode: config.mode,
  };
}

function isHtmlPayload(text: string, contentType: string | null): boolean {
  const trimmed = text.trimStart();
  return (
    Boolean(contentType && contentType.includes('text/html')) ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<HTML')
  );
}

function summarizeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value;
  }
}

function summarizeRequestBody(
  body: RequestInit['body']
): Record<string, unknown> | undefined {
  if (typeof body !== 'string') {
    return undefined;
  }

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const summary: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (key === 'phone_number' && typeof value === 'string') {
        summary.phone_number_suffix = value.slice(-4);
        continue;
      }

      if ((key === 'return_url' || key === 'notify_url') && typeof value === 'string') {
        summary[key] = summarizeUrl(value);
        continue;
      }

      summary[key] = value;
    }

    return summary;
  } catch {
    return undefined;
  }
}

function summarizeResponseText(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '<empty>';
  }

  return compact.slice(0, 400);
}

function extractJsonErrorMessage(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;

    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim();
    }

    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error.trim();
    }

    if (typeof parsed.status === 'string' && parsed.status.trim()) {
      return parsed.status.trim();
    }
  } catch {
    return null;
  }

  return null;
}

function deriveSupabaseProxyUrl(supabaseUrl?: string): string | null {
  if (!supabaseUrl) {
    return null;
  }

  try {
    const parsed = new URL(supabaseUrl);
    return `${parsed.origin}/functions/v1/payunit-proxy`;
  } catch {
    return null;
  }
}

function getProxyTarget(config: PayunitConfig): 'none' | 'external' | 'supabase' {
  if (config.externalProxyUrl && config.externalProxySecret) {
    return 'external';
  }

  if (
    config.supabaseProxyEnabled &&
    config.supabaseProxyUrl &&
    config.supabaseProxyAuthToken
  ) {
    return 'supabase';
  }

  return 'none';
}

function buildProxyPath(config: PayunitConfig, url: string): string {
  if (url.startsWith(config.baseUrl)) {
    return url.slice(config.baseUrl.length);
  }

  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function buildExternalProxyEndpoint(proxyUrl: string): string {
  return proxyUrl.endsWith('/proxy') ? proxyUrl : `${proxyUrl}/proxy`;
}

function buildExternalProxyRequestInit(
  config: PayunitConfig,
  url: string,
  options: RequestInit
): RequestInit {
  const payload: Record<string, unknown> = {
    path: buildProxyPath(config, url),
    method: options.method || 'GET',
  };

  if (typeof options.body === 'string') {
    try {
      payload.body = JSON.parse(options.body);
    } catch {
      payload.body = options.body;
    }
  }

  return {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.externalProxySecret}`,
    },
    body: JSON.stringify(payload),
  };
}

function buildSupabaseProxyRequestInit(
  config: PayunitConfig,
  url: string,
  options: RequestInit
): RequestInit {
  const payload: Record<string, unknown> = {
    path: buildProxyPath(config, url),
    method: options.method || 'GET',
  };

  if (typeof options.body === 'string') {
    try {
      payload.body = JSON.parse(options.body);
    } catch {
      payload.body = options.body;
    }
  }

  return {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.supabaseProxyAuthToken}`,
      apikey: config.supabaseProxyAuthToken || '',
      'x-payunit-api-user': config.apiUser,
      'x-payunit-api-password': config.apiPassword,
      'x-payunit-api-key': config.apiKey,
      'x-payunit-mode': config.mode,
      'x-payunit-base-url': config.baseUrl,
    },
    body: JSON.stringify(payload),
  };
}

async function requestJson<T>(
  config: PayunitConfig,
  url: string,
  options: RequestInit
): Promise<T> {
  const proxyTarget = getProxyTarget(config);
  const res =
    proxyTarget === 'external'
      ? await fetch(
          buildExternalProxyEndpoint(config.externalProxyUrl as string),
          buildExternalProxyRequestInit(config, url, options)
        )
      : proxyTarget === 'supabase'
        ? await fetch(
            config.supabaseProxyUrl as string,
            buildSupabaseProxyRequestInit(config, url, options)
          )
        : await fetch(url, options);
  const text = await res.text();
  const contentType = res.headers.get('content-type');
  const requestBody = summarizeRequestBody(options.body);

  if (!res.ok) {
    const htmlResponse = isHtmlPayload(text, contentType);
    const jsonErrorMessage = htmlResponse ? null : extractJsonErrorMessage(text);
    const responseSummary = htmlResponse
      ? 'HTML response omitted'
      : jsonErrorMessage || summarizeResponseText(text);

    console.error('Payunit HTTP request failed', {
      url,
      proxyTarget,
      method: options.method || 'GET',
      status: res.status,
      contentType,
      requestBody,
      response: responseSummary,
    });

    if (isHtmlPayload(text, contentType)) {
      throw new Error(
        `Payunit API error (${res.status}): Upstream gateway blocked the request before returning JSON.`
      );
    }

    throw new Error(
      `Payunit API error (${res.status}): ${responseSummary || 'Unexpected empty response.'}`
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    console.error('Payunit API returned invalid JSON', {
      url,
      proxyTarget,
      method: options.method || 'GET',
      status: res.status,
      contentType,
      requestBody,
      response: summarizeResponseText(text),
    });

    throw new Error('Payunit API returned invalid JSON.');
  }
}

function assertSuccess<T>(payload: PayunitEnvelope<T>, context: string) {
  if (payload?.status && payload.status !== 'SUCCESS') {
    console.error('Payunit API returned a failed JSON payload', {
      context,
      status: payload.status,
      statusCode: payload.statusCode,
      message: payload.message || payload.status,
    });

    const message = payload.message || payload.status;
    throw new Error(`${context} failed: ${message}`);
  }
}

export function shouldUseHostedCheckoutFallback(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.startsWith('Payunit API error (') ||
    error.message === 'Payunit API returned invalid JSON.'
  );
}

export function getPayunitRuntimeInfo(): PayunitRuntimeInfo {
  const config = getConfig();
  const proxyTarget = getProxyTarget(config);
  const proxyEnabled =
    Boolean(config.externalProxyUrl || config.externalProxySecret) ||
    config.supabaseProxyEnabled;
  const proxyConfigured =
    proxyTarget === 'external'
      ? Boolean(config.externalProxyUrl && config.externalProxySecret)
      : proxyTarget === 'supabase'
        ? Boolean(config.supabaseProxyUrl && config.supabaseProxyAuthToken)
        : false;

  return {
    mode: config.mode,
    baseUrl: config.baseUrl,
    proxyEnabled,
    proxyConfigured,
    proxyInUse: proxyTarget !== 'none',
    proxyTarget,
  };
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export async function initializePayment(
  params: InitializePaymentParams
): Promise<InitializePaymentResponse> {
  const config = getConfig();

  const body: Record<string, unknown> = {
    total_amount: params.amount,
    currency: params.currency || 'XAF',
    transaction_id: params.transactionId,
    return_url: params.returnUrl,
    payment_country: params.paymentCountry || 'CM',
  };

  if (params.notifyUrl) {
    body.notify_url = params.notifyUrl;
  }

  const payload = await requestJson<PayunitEnvelope<InitializePaymentResponse>>(
    config,
    `${config.baseUrl}/api/gateway/initialize`,
    {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify(body),
    }
  );

  assertSuccess(payload, 'Payunit initialize');
  return payload.data;
}

export async function makePayment(
  params: MakePaymentParams
): Promise<MakePaymentResponse> {
  const config = getConfig();

  const body: Record<string, unknown> = {
    gateway: params.gateway,
    amount: params.amount,
    transaction_id: params.transactionId,
    phone_number: params.phoneNumber,
    return_url: params.returnUrl,
    currency: params.currency || 'XAF',
    paymentType: params.paymentType || 'button',
  };

  if (params.notifyUrl) {
    body.notify_url = params.notifyUrl;
  }

  const payload = await requestJson<PayunitEnvelope<MakePaymentResponse>>(
    config,
    `${config.baseUrl}/api/gateway/makepayment`,
    {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify(body),
    }
  );

  assertSuccess(payload, 'Payunit make payment');
  return payload.data;
}

export async function getPaymentStatus(
  transactionId: string
): Promise<PaymentStatusResponse> {
  const config = getConfig();

  const payload = await requestJson<PayunitEnvelope<PaymentStatusResponse>>(
    config,
    `${config.baseUrl}/api/gateway/paymentstatus/${transactionId}`,
    {
      method: 'GET',
      headers: headers(config),
    }
  );

  assertSuccess(payload, 'Payunit payment status');
  return payload.data;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function buildPayunitTransactionId(transactionId: string): string {
  const cleaned = transactionId.replace(/[^a-zA-Z0-9]/g, '');
  return `jbl${cleaned}`;
}

export function detectCarrier(
  phone: string
): 'MTN' | 'ORANGE' | 'UNKNOWN' {
  const cleaned = phone.replace(/^\+?237/, '');
  if (cleaned.length < 3) return 'UNKNOWN';

  const prefix3 = cleaned.substring(0, 3);
  const prefix2 = cleaned.substring(0, 2);
  const prefixNum = parseInt(prefix3, 10);

  if (prefix2 === '67') return 'MTN';
  if (prefixNum >= 650 && prefixNum <= 654) return 'MTN';
  if (prefixNum >= 680 && prefixNum <= 689) return 'MTN';

  if (prefix2 === '69') return 'ORANGE';
  if (prefixNum >= 655 && prefixNum <= 659) return 'ORANGE';

  return 'UNKNOWN';
}

export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  if (cleaned.startsWith('237')) {
    cleaned = cleaned.substring(3);
  }
  return cleaned;
}

export function resolveGateway(phone: string, override?: string): string {
  if (override) return override;

  const carrier = detectCarrier(phone);
  if (carrier === 'MTN') return 'CM_MTN';
  if (carrier === 'ORANGE') return 'CM_ORANGE';

  const fallback = process.env.PAYUNIT_DEFAULT_GATEWAY;
  if (fallback) return fallback;

  throw new Error(
    'Unable to detect a supported Mobile Money provider. Use an MTN or Orange number.'
  );
}
