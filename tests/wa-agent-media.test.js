const assert = require('node:assert/strict');
const { loadTs, serviceClientStub } = require('./helpers/load-ts');

const stubs = { '@/lib/supabase/service': serviceClientStub };
const media = loadTs('lib/whatsapp-agent/agent/media.ts', stubs);
const downloader = loadTs('lib/whatsapp-media.ts', stubs);
const transcriber = loadTs('lib/ai/transcribe.ts', stubs);
const resume = loadTs('lib/profile/store-resume.ts', stubs);

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]).buffer; // %PDF-1.7
const NOT_PDF = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]).buffer; // MZ (an .exe)

function tooLarge() {
  const error = new Error('media is big');
  error.name = 'MediaTooLargeError';
  return error;
}

function setup({ transcript = 'cashier jobs in Douala', download, storeResult = { status: 'stored', resumeUrl: 'https://x/cv.pdf' } } = {}) {
  const calls = { downloads: [], transcripts: [], stored: [] };
  const deps = {
    download: async (id, max) => {
      calls.downloads.push([id, max]);
      if (download) return download(id, max);
      return { buffer: PDF, mimeType: 'application/pdf', size: PDF.byteLength };
    },
    transcribe: async () => {
      if (transcript instanceof Error) throw transcript;
      return transcript;
    },
    storeResume: async (params) => {
      calls.stored.push(params);
      return storeResult;
    },
    recordTranscript: async (id, text) => calls.transcripts.push([id, text]),
    registerUrl: () => 'https://joblinca.com/auth/register?role=job_seeker',
    profileUrl: 'https://joblinca.com/dashboard/job-seeker/profile',
  };
  return { deps, calls };
}

const lead = (extra = {}) => ({ id: 'l1', phone_e164: '+237670000001', linked_user_id: 'u1', language: 'en', ...extra });
const voice = { id: 'wamid.v', from: '237670000001', timestamp: '1', type: 'audio', audio: { id: 'media-a', mime_type: 'audio/ogg; codecs=opus' } };
const doc = (extra = {}) => ({ id: 'wamid.d', from: '237670000001', timestamp: '1', type: 'document', document: { id: 'media-d', mime_type: 'application/pdf', filename: 'Ada CV.pdf', ...extra } });

async function main() {
  // ── voice notes ───────────────────────────────────────────────────────────
  {
    const { deps, calls } = setup();
    const out = await media.handleInboundMedia({ message: voice, lead: lead(), role: 'job_seeker', deps });
    assert.deepEqual(out, { kind: 'transcript', text: 'cashier jobs in Douala' });
    assert.equal(calls.downloads[0][1], media.VOICE_MAX_BYTES);
    assert.deepEqual(calls.transcripts, [['wamid.v', '[voice] cashier jobs in Douala']], 'log shows the transcript');

    const anon = await media.handleInboundMedia({ message: voice, lead: lead({ linked_user_id: null }), role: null, deps });
    assert.equal(anon.kind, 'transcript', 'voice works without an account too');
  }
  {
    const empty = await media.handleInboundMedia({ message: voice, lead: lead(), role: null, deps: setup({ transcript: ' ' }).deps });
    assert.equal(empty.event, 'voice_empty');
    const long = await media.handleInboundMedia({ message: voice, lead: lead({ language: 'fr' }), role: null, deps: setup({ download: () => { throw tooLarge(); } }).deps });
    assert.equal(long.event, 'voice_too_long');
    assert.match(long.reply, /un peu long/);
    const down = await media.handleInboundMedia({ message: voice, lead: lead(), role: null, deps: setup({ transcript: new Error('429') }).deps });
    assert.equal(down.event, 'voice_failed');
  }
  console.log('ok - voice notes: transcribed into text, logged, graceful when empty/long/failed');

  // ── CVs ───────────────────────────────────────────────────────────────────
  {
    const { deps, calls } = setup();
    const out = await media.handleInboundMedia({ message: doc(), lead: lead(), role: 'job_seeker', deps });
    assert.equal(out.event, 'cv_stored');
    assert.match(out.reply, /CV saved to your profile/);
    assert.equal(calls.downloads[0][1], 5 * 1024 * 1024);
    assert.deepEqual(calls.stored[0], { userId: 'u1', role: 'job_seeker', buffer: PDF, mimeType: 'application/pdf', filename: 'Ada CV.pdf' });
  }
  {
    const { deps, calls } = setup();
    const out = await media.handleInboundMedia({ message: doc(), lead: lead({ linked_user_id: null }), role: null, deps });
    assert.equal(out.event, 'cv_no_account');
    assert.match(out.reply, /auth\/register/);
    assert.deepEqual(calls.downloads, [], 'nothing downloaded without an account');

    const rec = await media.handleInboundMedia({ message: doc(), lead: lead(), role: 'recruiter', deps });
    assert.equal(rec.event, 'document_from_recruiter');

    const big = await media.handleInboundMedia({ message: doc(), lead: lead(), role: 'job_seeker', deps: setup({ download: () => { throw tooLarge(); } }).deps });
    assert.equal(big.event, 'cv_too_large');

    const bad = await media.handleInboundMedia({ message: doc(), lead: lead(), role: 'job_seeker', deps: setup({ storeResult: { status: 'bad_content' } }).deps });
    assert.equal(bad.event, 'cv_bad_content');
    assert.match(bad.reply, /PDF or Word/);
  }
  console.log('ok - CVs: saved for accounts, refused cleanly otherwise');

  {
    const { deps } = setup();
    const image = await media.handleInboundMedia({ message: { id: 'i', from: '1', timestamp: '1', type: 'image', image: { id: 'm' } }, lead: lead(), role: null, deps });
    assert.equal(image.event, 'image_unsupported');
    const sticker = await media.handleInboundMedia({ message: { id: 's', from: '1', timestamp: '1', type: 'sticker', sticker: { id: 'm' } }, lead: lead(), role: null, deps });
    assert.deepEqual(sticker, { kind: 'ignore' });
    assert.equal(media.inboundMediaKind({ type: 'audio' }), null, 'no media id, no media');
  }
  console.log('ok - photos get a pointer, stickers are left alone');

  // ── download: size guard before the bytes ─────────────────────────────────
  {
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
    const requests = [];
    const fakeFetch = (meta, body) => async (url, init) => {
      requests.push([url, init.headers.Authorization]);
      if (url.includes('graph.facebook.com')) return { ok: true, json: async () => meta };
      return { ok: true, arrayBuffer: async () => body, headers: { get: () => null } };
    };
    const got = await downloader.downloadWhatsappMedia('m1', {
      maxBytes: 100,
      fetchImpl: fakeFetch({ url: 'https://lookaside.fbsbx.com/x', mime_type: 'audio/ogg; codecs=opus', file_size: 9 }, PDF),
    });
    assert.equal(got.mimeType, 'audio/ogg');
    assert.equal(got.size, PDF.byteLength);
    assert.deepEqual(requests.map((r) => r[1]), ['Bearer tok', 'Bearer tok']);

    requests.length = 0;
    await assert.rejects(
      downloader.downloadWhatsappMedia('m2', { maxBytes: 100, fetchImpl: fakeFetch({ url: 'https://x', file_size: 5000 }, PDF) }),
      (e) => e.name === 'MediaTooLargeError'
    );
    assert.equal(requests.length, 1, 'oversized file never downloaded');

    await assert.rejects(
      downloader.downloadWhatsappMedia('m3', { maxBytes: 4, fetchImpl: fakeFetch({ url: 'https://x', file_size: 1 }, PDF) }),
      (e) => e.name === 'MediaTooLargeError',
      'declared size is not trusted'
    );
  }
  console.log('ok - media download checks size before and after');

  // ── transcription request ─────────────────────────────────────────────────
  {
    process.env.OPENAI_API_KEY = 'sk-test';
    let sent;
    const text = await transcriber.transcribeAudio(PDF, 'audio/ogg', {
      fetchImpl: async (url, init) => {
        sent = { url, init };
        return { ok: true, json: async () => ({ text: '  je cherche un travail à Douala ' }) };
      },
    });
    assert.equal(text, 'je cherche un travail à Douala');
    assert.equal(sent.url, 'https://api.openai.com/v1/audio/transcriptions');
    assert.equal(sent.init.body.get('model'), 'gpt-4o-mini-transcribe');
    assert.equal(sent.init.body.get('file').name, 'voice.ogg');
    await assert.rejects(
      transcriber.transcribeAudio(PDF, 'audio/ogg', { fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'quota' }) }),
      /transcription failed \(429\): quota/
    );
    delete process.env.OPENAI_API_KEY;
  }
  console.log('ok - transcription request shape and errors');

  // ── storeResumeForUser: same rules as the website ─────────────────────────
  {
    const ops = [];
    const service = {
      storage: {
        from: (bucket) => ({
          upload: async (path, buf, opts) => { ops.push(['upload', bucket, path, opts.contentType]); return { error: null }; },
          getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn/${path}` } }),
        }),
      },
      from: (table) => ({
        update: (values) => ({ eq: async (col, val) => { ops.push(['update', table, col, val, values.resume_url]); return { error: null }; } }),
      }),
    };
    const base = { userId: 'u1', role: 'job_seeker', buffer: PDF, mimeType: 'application/pdf', filename: 'cv.pdf' };

    assert.equal((await resume.storeResumeForUser(service, { ...base, role: 'recruiter' })).status, 'not_seeker');
    assert.equal((await resume.storeResumeForUser(service, { ...base, mimeType: 'image/png' })).status, 'bad_type');
    assert.equal((await resume.storeResumeForUser(service, { ...base, filename: 'cv.exe' })).status, 'bad_type');
    assert.equal((await resume.storeResumeForUser(service, { ...base, buffer: NOT_PDF })).status, 'bad_content');
    assert.equal((await resume.storeResumeForUser(service, { ...base, buffer: new ArrayBuffer(5 * 1024 * 1024 + 1) })).status, 'too_large');
    assert.equal(ops.length, 0, 'nothing uploaded for rejected files');

    const ok = await resume.storeResumeForUser(service, { ...base, filename: null });
    assert.equal(ok.status, 'stored');
    assert.match(ops[0][2], /^resumes\/u1\/resume-\d+\.pdf$/, 'extension derived when WhatsApp gives no filename');
    assert.deepEqual(ops[1].slice(0, 4), ['update', 'job_seeker_profiles', 'user_id', 'u1']);

    await resume.storeResumeForUser(service, { ...base, role: 'talent' });
    assert.equal(ops[3][1], 'talent_profiles');
  }
  console.log('ok - storeResumeForUser enforces type, extension, magic bytes and size before uploading');
}

main()
  .then(() => console.log('All wa-agent media tests passed.'))
  .catch((error) => {
    console.error('Test failure:', error instanceof Error ? error.stack : error);
    process.exit(1);
  });
