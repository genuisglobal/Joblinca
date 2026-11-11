/**
 * Speech-to-text for WhatsApp voice notes (OGG/Opus), via OpenAI.
 *
 * Model defaults to gpt-4o-mini-transcribe (about half whisper-1's price);
 * override with WA_TRANSCRIBE_MODEL. Callers cap the file size, so a voice
 * note costs well under a cent.
 */

const DEFAULT_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';

/** Bias toward the languages and places our users actually speak about. */
const TRANSCRIBE_PROMPT =
  'WhatsApp voice note to JobLinca, a job platform in Cameroon. English or French. Towns like Douala, Yaoundé, Buea, Bamenda, Limbe, Bafoussam, Garoua.';

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'm4a',
  'audio/amr': 'amr',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
};

export async function transcribeAudio(
  audio: ArrayBuffer,
  mimeType: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<string> {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'your_openai_api_key_here') throw new Error('OPENAI_API_KEY missing');

  const fetchImpl = options.fetchImpl ?? fetch;
  const ext = EXTENSION_BY_MIME[mimeType] || 'ogg';
  const form = new FormData();
  form.append('file', new Blob([audio], { type: mimeType }), `voice.${ext}`);
  form.append('model', process.env.WA_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL);
  form.append('prompt', TRANSCRIBE_PROMPT);
  form.append('response_format', 'json');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  try {
    const response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`transcription failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
    }
    const payload = (await response.json()) as { text?: string };
    return (payload.text || '').trim();
  } finally {
    clearTimeout(timeout);
  }
}
