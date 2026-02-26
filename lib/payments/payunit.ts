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
 *   PAYUNIT_DEFAULT_GATEWAY (optional)
 */

type PayunitMode = 'test' | 'live';

interface PayunitConfig {
  apiUser: string;
  apiPassword: string;
  apiKey: string;
  mode: PayunitMode;
  baseUrl: string;
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

function getConfig(): PayunitConfig {
  const apiUser = process.env.PAYUNIT_API_USER;
  const apiPassword = process.env.PAYUNIT_API_PASSWORD;
  const apiKey = process.env.PAYUNIT_API_KEY;
  const mode = (process.env.PAYUNIT_MODE || 'test').toLowerCase() as PayunitMode;
  const baseUrl = process.env.PAYUNIT_BASE_URL || 'https://gateway.payunit.net';

  if (!apiUser || !apiPassword || !apiKey) {
    throw new Error(
      'PAYUNIT_API_USER, PAYUNIT_API_PASSWORD, and PAYUNIT_API_KEY must be configured.'
    );
  }

  return { apiUser, apiPassword, apiKey, mode, baseUrl };
}

function headers(config: PayunitConfig): Record<string, string> {
  const basic = Buffer.from(`${config.apiUser}:${config.apiPassword}`).toString(
    'base64'
  );

  return {
    'Content-Type': 'application/json',
    Authorization: `Basic ${basic}`,
    'x-api-key': config.apiKey,
    mode: config.mode,
  };
}

async function requestJson<T>(
  url: string,
  options: RequestInit
): Promise<T> {
  const res = await fetch(url, options);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Payunit API error (${res.status}): ${text}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Payunit API returned invalid JSON.');
  }
}

function assertSuccess<T>(payload: PayunitEnvelope<T>, context: string) {
  if (payload?.status && payload.status !== 'SUCCESS') {
    const message = payload.message || payload.status;
    throw new Error(`${context} failed: ${message}`);
  }
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
