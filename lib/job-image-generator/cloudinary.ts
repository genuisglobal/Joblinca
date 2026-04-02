import { createHash } from 'crypto';

import type { CloudinaryUploadResult } from './types';

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
}

function normalizeFolder(value: string | undefined): string {
  return (value || 'job-marketing').trim().replace(/^\/+|\/+$/g, '');
}

function getCloudinaryConfig(folderOverride?: string): CloudinaryConfig {
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    );
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    folder: normalizeFolder(folderOverride || process.env.CLOUDINARY_UPLOAD_FOLDER),
  };
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    (process.env.CLOUDINARY_CLOUD_NAME || '').trim() &&
      (process.env.CLOUDINARY_API_KEY || '').trim() &&
      (process.env.CLOUDINARY_API_SECRET || '').trim()
  );
}

function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const serialized = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return createHash('sha1').update(`${serialized}${apiSecret}`).digest('hex');
}

export async function uploadJobImageToCloudinary(params: {
  buffer: Buffer;
  publicId: string;
  folder?: string;
  tags?: string[];
}): Promise<CloudinaryUploadResult> {
  const config = getCloudinaryConfig(params.folder);
  const timestamp = Math.floor(Date.now() / 1000);
  const signedParams: Record<string, string | number> = {
    folder: config.folder,
    overwrite: 'true',
    public_id: params.publicId,
    timestamp,
    unique_filename: 'false',
    use_filename: 'false',
  };

  if (params.tags && params.tags.length > 0) {
    signedParams.tags = params.tags.join(',');
  }

  const formData = new FormData();
  Object.entries(signedParams).forEach(([key, value]) => {
    formData.append(key, String(value));
  });
  formData.append('api_key', config.apiKey);
  formData.append('signature', signParams(signedParams, config.apiSecret));
  formData.append(
    'file',
    new Blob([new Uint8Array(params.buffer)], { type: 'image/png' }),
    `${params.publicId}.png`
  );

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  const payload = (await response.json()) as {
    secure_url?: string;
    public_id?: string;
    bytes?: number;
    version?: string | number;
    error?: { message?: string };
  };

  if (!response.ok || !payload.secure_url || !payload.public_id) {
    throw new Error(payload.error?.message || 'Cloudinary upload failed.');
  }

  return {
    imageUrl: payload.secure_url,
    publicId: payload.public_id,
    bytes: Number(payload.bytes || params.buffer.length),
    version: payload.version ?? null,
  };
}
