const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts');

const templates = loadTs('lib/messaging/wa-templates.ts');

function senders({ templateFails = false, textFails = false } = {}) {
  const calls = { templates: [], texts: [] };
  return {
    calls,
    sendTemplate: async (to, name, lang, components) => {
      if (templateFails) throw new Error('(#132001) Template name does not exist in the translation');
      calls.templates.push({ to, name, lang, components });
    },
    sendText: async (to, text) => {
      if (textFails) throw new Error('(#131047) Re-engagement message');
      calls.texts.push({ to, text });
    },
  };
}

async function main() {
  // Param hygiene: Meta rejects newlines, tabs, 4+ spaces.
  assert.equal(templates.toTemplateParam('Line one\n\nline\ttwo     end'), 'Line one line two end');
  assert.equal(templates.toTemplateParam('   '), '-', 'empty params are rejected by Meta too');
  assert.equal(templates.toTemplateParam('x'.repeat(2000)).length, 900);
  console.log('ok - template params flattened and capped');

  // Name / language resolution.
  assert.deepEqual(templates.resolveTemplate('teamReply', 'fr', {}), { name: 'team_reply_v1', language: 'fr' });
  assert.deepEqual(templates.resolveTemplate('adminHandoff', 'fr', {}), { name: 'admin_handoff_alert_v1', language: 'en' }, 'en-only templates stay en');
  assert.deepEqual(templates.resolveTemplate('teamReply', null, { WA_TEAM_REPLY_TEMPLATE: 'team_reply_v2' }), { name: 'team_reply_v2', language: 'en' });
  assert.equal(templates.resolveTemplate('teamReply', 'en', { WA_TEAM_REPLY_TEMPLATE: 'OFF' }), null);
  console.log('ok - template name, language and off switch');

  // Template first, text fallback.
  {
    const s = senders();
    const result = await templates.sendTemplateWithFallback(s, {
      to: '+237670000001', template: 'jobPostApproved', language: 'fr',
      body: ['Caissière', 'JL-001042'], urlButtonSuffix: 'job-uuid', fallbackText: 'fallback',
    });
    assert.equal(result, 'template');
    assert.deepEqual(s.calls.templates[0], {
      to: '+237670000001', name: 'job_post_approved_v1', lang: 'fr',
      components: [
        { type: 'body', parameters: [{ type: 'text', text: 'Caissière' }, { type: 'text', text: 'JL-001042' }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'job-uuid' }] },
      ],
    });
    assert.deepEqual(s.calls.texts, []);
  }
  {
    const s = senders({ templateFails: true });
    const warn = console.warn; console.warn = () => {};
    const result = await templates.sendTemplateWithFallback(s, { to: 'x', template: 'teamReply', body: ['a', 'b'], fallbackText: 'plain' });
    assert.equal(result, 'text', 'unapproved template -> text, as before');
    assert.deepEqual(s.calls.texts, [{ to: 'x', text: 'plain' }]);
    const both = senders({ templateFails: true, textFails: true });
    assert.equal(await templates.sendTemplateWithFallback(both, { to: 'x', template: 'teamReply', body: ['a', 'b'], fallbackText: 'plain' }), 'failed');
    console.warn = warn;
  }
  console.log('ok - template first, text fallback, failure reported');

  const now = Date.parse('2026-10-03T12:00:00Z');
  assert.equal(templates.isWithinServiceWindow('2026-10-03T00:00:00Z', now), true);
  assert.equal(templates.isWithinServiceWindow('2026-10-02T11:59:00Z', now), false);
  assert.equal(templates.isWithinServiceWindow(null, now), false);
  console.log('ok - 24h service window');

  // Recruiter notices.
  function loadNotify(lead, s) {
    return loadTs('lib/jobs/recruiter-notify.ts', {
      '@/lib/whatsapp': { sendTemplate: s.sendTemplate, sendText: s.sendText },
    });
  }
  const db = (lead) => ({
    from: () => {
      const chain = { select: () => chain, eq: () => chain, limit: () => chain, maybeSingle: async () => ({ data: lead }) };
      return chain;
    },
  });
  {
    const s = senders();
    const notify = loadNotify(null, s);
    const ok = await notify.notifyRecruiterViaWhatsApp(db({ phone_e164: '+237690000000', language: 'fr' }), 'rec-1', 'fallback', {
      kind: 'rejected', jobTitle: 'Caissière', publicId: 'JL-001042', reason: 'salary missing',
    });
    assert.equal(ok, true);
    assert.equal(s.calls.templates[0].name, 'job_post_rejected_v1');
    assert.equal(s.calls.templates[0].lang, 'fr');
    assert.deepEqual(s.calls.templates[0].components[0].parameters.map((p) => p.text), ['Caissière', 'JL-001042', 'salary missing']);

    const legacy = senders();
    await loadNotify(null, legacy).notifyRecruiterViaWhatsApp(db({ phone_e164: '+237690000000' }), 'rec-1', 'plain only');
    assert.deepEqual(legacy.calls.texts, [{ to: '+237690000000', text: 'plain only' }], 'no template details -> unchanged behaviour');

    const none = senders();
    assert.equal(await loadNotify(null, none).notifyRecruiterViaWhatsApp(db(null), 'rec-1', 'x', { kind: 'approved', jobId: 'j', jobTitle: 't', publicId: null }), false);
    assert.deepEqual(none.calls, { templates: [], texts: [] }, 'no WhatsApp lead -> nothing sent');
  }
  console.log('ok - recruiter notices use job_post templates in the lead language');
}

main()
  .then(() => console.log('All wa-templates tests passed.'))
  .catch((error) => {
    console.error('Test failure:', error instanceof Error ? error.stack : error);
    process.exit(1);
  });
