/**
 * Download media a user sent us on WhatsApp.
 *
 * Meta's webhook carries only a media id. Resolving it is two calls, both
 * with the system-user token: GET /{media-id} returns a short-lived URL plus
 * the mime type and size, then GET that URL returns the bytes. The size is
 * checked before downloading, so an oversized file costs one small request.
 */

import { WA_BASE_URL } from '@/lib/whatsapp';

export interface DownloadedMedia {
  buffer: ArrayBuffer;
  mimeType: string;
  size: number;
}

export class MediaTooLargeError extends Error {
  constructor(public readonly size: number, public readonly maxBytes: number) {
    super(`media is ${size} bytes, limit ${maxBytes}`);
    this.name = 'MediaTooLargeError';
  }
}

function getToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN is not set');
  return token;
}

export async function downloadWhatsappMedia(
  mediaId: string,
  options: { maxBytes: number; timeoutMs?: number; fetchImpl?: typeof fetch }
): Promise<DownloadedMedia> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = getToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);

  try {
    const metaResponse = await fetchImpl(`${WA_BASE_URL}/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!metaResponse.ok) {
      throw new Error(`media lookup failed (${metaResponse.status})`);
    }
    const meta = (await metaResponse.json()) as { url?: string; mime_type?: string; file_size?: number };
    if (!meta.url) throw new Error('media lookup returned no url');

    const declaredSize = Number(meta.file_size || 0);
    if (declaredSize > options.maxBytes) throw new MediaTooLargeError(declaredSize, options.maxBytes);

    const fileResponse = await fetchImpl(meta.url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!fileResponse.ok) {
      throw new Error(`media download failed (${fileResponse.status})`);
    }
    const buffer = await fileResponse.arrayBuffer();
    // Don't trust the declared size alone.
    if (buffer.byteLength > options.maxBytes) throw new MediaTooLargeError(buffer.byteLength, options.maxBytes);

    return {
      buffer,
      mimeType: (meta.mime_type || fileResponse.headers.get('content-type') || 'application/octet-stream')
        .split(';')[0]
        .trim(),
      size: buffer.byteLength,
    };
  } finally {
    clearTimeout(timeout);
  }
}
