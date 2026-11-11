const assert = require('node:assert/strict');
const { loadTs, serviceClientStub } = require('./helpers/load-ts');

/** Load the messaging module with a fake Meta client that knows which translations exist. */
function load(approved) {
  const sent = [];
  const messaging = loadTs('lib/messaging/whatsapp.ts', {
    '@/lib/supabase/service': serviceClientStub,
    '@/lib/whatsapp': {
      sendText: async () => ({ messages: [{ id: 'wamid.t' }] }),
      sendQuickReplyButtons: async () => ({}),
      sendTemplate: async (to, name, lang) => {
        if (!approved.includes(`${name}:${lang}`)) {
          throw new Error(`WA sendTemplate failed (404): {"error":{"message":"(#132001) Template name does not exist in the translation","code":132001}}`);
        }
        sent.push(`${name}:${lang}`);
        return { messages: [{ id: 'wamid.x' }] };
      },
    },
    '@/lib/whatsapp-db': {
      saveOutboundMessage: async () => ({}),
      getLeadLanguage: async () => null,
    },
  });
  return { messaging, sent };
}

async function main() {
  const fr = async () => 'fr';
  const en = async () => 'en';

  {
    const { messaging, sent } = load(['interview_reminder_v1:en']);
    await messaging.sendWhatsappTemplateLocalized('+237690000000', 'interview_reminder_v1', 'en', [], null, fr);
    assert.deepEqual(sent, ['interview_reminder_v1:en'], 'no French copy yet -> English template, as today');
  }
  {
    const { messaging, sent } = load(['interview_reminder_v1:en', 'interview_reminder_v1:fr']);
    await messaging.sendWhatsappTemplateLocalized('+237690000000', 'interview_reminder_v1', 'en', [], null, fr);
    assert.deepEqual(sent, ['interview_reminder_v1:fr'], 'French copy approved -> French, once');
  }
  {
    const { messaging, sent } = load(['interview_reminder_v1:en', 'interview_reminder_v1:fr']);
    await messaging.sendWhatsappTemplateLocalized('+237670000000', 'interview_reminder_v1', 'en', [], null, en);
    await messaging.sendWhatsappTemplateLocalized('+237670000001', 'interview_reminder_v1', 'en', [], null, async () => null);
    assert.deepEqual(sent, ['interview_reminder_v1:en', 'interview_reminder_v1:en'], 'English or unknown -> English');
  }
  {
    // A configured non-English language is respected as-is (no lookup).
    const { messaging, sent } = load(['matched_jobs_digest_v1:pt_BR']);
    let looked = false;
    await messaging.sendWhatsappTemplateLocalized('+1', 'matched_jobs_digest_v1', 'pt_BR', [], null, async () => { looked = true; return 'fr'; });
    assert.deepEqual(sent, ['matched_jobs_digest_v1:pt_BR']);
    assert.equal(looked, false);
  }
  {
    // Any other failure is not retried in English: it would fail the same way, or double-send.
    const sent = [];
    const messaging = loadTs('lib/messaging/whatsapp.ts', {
      '@/lib/supabase/service': serviceClientStub,
      '@/lib/whatsapp': {
        sendText: async () => ({}),
        sendQuickReplyButtons: async () => ({}),
        sendTemplate: async (to, name, lang) => {
          sent.push(lang);
          throw new Error('WA sendTemplate failed (400): (#132000) Number of parameters does not match');
        },
      },
      '@/lib/whatsapp-db': { saveOutboundMessage: async () => ({}), getLeadLanguage: async () => null },
    });
    await assert.rejects(messaging.sendWhatsappTemplateLocalized('+237690000000', 't', 'en', [], null, fr), /132000/);
    assert.deepEqual(sent, ['fr'], 'only 132001 falls back to English');
  }
  {
    // A failed language lookup never blocks the send.
    const { messaging, sent } = load(['t:en']);
    await messaging.sendWhatsappTemplateLocalized('+1', 't', 'en', [], null, async () => { throw new Error('db down'); });
    assert.deepEqual(sent, ['t:en']);
  }
  console.log('ok - localized templates: French when approved, English until then, no double sends');
}

main()
  .then(() => console.log('All wa-template-localized tests passed.'))
  .catch((error) => {
    console.error('Test failure:', error instanceof Error ? error.stack : error);
    process.exit(1);
  });
