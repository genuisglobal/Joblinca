const assert = require('node:assert/strict');
const { loadTs, serviceClientStub } = require('./helpers/load-ts');

const stubs = {
  '@/lib/subscriptions': { getUserSubscription: async () => ({ isActive: false }) },
  '@/lib/supabase/service': serviceClientStub,
};

const tools = loadTs('lib/whatsapp-agent/agent/tools.ts', stubs);
const search = loadTs('lib/whatsapp-agent/agent/search.ts', {
  ...stubs,
  '@/lib/search/synonyms': { expandSearchSynonyms: () => [] },
  '@/lib/whatsapp-agent/job-search': { searchPublishedJobs: async () => ({ jobs: [] }) },
});

function job(n, extra = {}) {
  return {
    id: `id-${n}`,
    public_id: `JL-${1000 + n}`,
    title: `Cashier ${n}`,
    company_name: 'Shop',
    location: 'Douala',
    salary: 80000,
    description: 'Handle the till.',
    closes_at: null,
    ...extra,
  };
}

function makeLead(extra = {}) {
  return {
    id: 'lead-1',
    phone_e164: '+237670000001',
    linked_user_id: null,
    views_month_count: 0,
    last_search_offset: 0,
    ...extra,
  };
}

function makeCtx({
  lead = makeLead(),
  dryRun = false,
  subscribed = false,
  inboundText = 'hi',
  jobs = [],
  memory = {},
  reportResult = { status: 'reported' },
  alertResult = { configured: true, sent: 1 },
} = {}) {
  const writes = [];
  const deps = {
    searchWithWidening: async (query) => ({ jobs, query, widened: [] }),
    rankedSearch: async () => jobs,
    getJobByPublicId: async (id) => jobs.find((j) => j.public_id === id) || null,
    getJobById: async (id) => jobs.find((j) => j.id === id) || null,
    saveLastSearch: async (...args) => writes.push(['saveLastSearch', ...args]),
    setLastSearchOffset: async (...args) => writes.push(['setLastSearchOffset', ...args]),
    incrementViewCounter: async (l, n) => writes.push(['incrementViewCounter', n]),
    createSignupInvite: async (input) => {
      writes.push(['createSignupInvite', input]);
      return { status: 'invite_created', claimUrl: 'https://joblinca.com/complete-registration/tok' };
    },
    buildRegisterUrl: (phone, role) => `https://joblinca.com/auth/register?role=${role}`,
    menuMessage: () => 'MENU TEXT',
    storePendingApply: async (...args) => writes.push(['storePendingApply', ...args]),
    submitReport: async (params) => {
      writes.push(['submitReport', params]);
      return reportResult;
    },
    listSeekerPlans: async () => [{ name: 'Seeker Monthly', amountXaf: 2000, durationDays: 30 }],
    pauseLead: async (...args) => writes.push(['pauseLead', ...args]),
    alertAdmins: async (message) => {
      writes.push(['alertAdmins', message]);
      return alertResult;
    },
    links: {
      subscribe: 'https://joblinca.com/pricing?role=job_seeker',
      profile: 'https://joblinca.com/dashboard/job-seeker/profile',
      cvBuilder: 'https://joblinca.com/resume',
      login: 'https://joblinca.com/auth/login',
      forgotPassword: 'https://joblinca.com/auth/forgot-password',
    },
  };
  const ctx = {
    lead,
    inboundText,
    language: 'en',
    subscribed,
    dryRun,
    deps,
    memory: { ...memory },
    attachments: [],
    nextState: null,
    followUp: null,
    displayName: 'Ada Nkem',
  };
  return { ctx, writes };
}

const run = (ctx, name, args = {}) => tools.executeTool(ctx, name, JSON.stringify(args));

async function main() {
  // ── widening ──────────────────────────────────────────────────────────────
  {
    const q = { role: 'cashier', location: 'Buea', type: 'job', recency: '7d' };
    const steps = [];
    let current = q;
    for (let next = search.widenQuery(current); next; next = search.widenQuery(current)) {
      steps.push(next.step);
      current = next.query;
    }
    assert.deepEqual(steps, ['recency', 'location', 'role']);
    assert.deepEqual(current, { role: null, location: null, type: 'job', recency: '30d' });

    const seen = [];
    const result = await search.searchWithWidening(q, 10, async (query) => {
      seen.push(query);
      return query.location === null ? [job(1)] : [];
    });
    assert.deepEqual(result.widened, ['recency', 'location']);
    assert.equal(result.query.role, 'cashier', 'role is kept when dropping the town is enough');
    assert.equal(seen.length, 3);
    console.log('ok - widening relaxes recency, then town, then role, and stops at first hit');
  }

  // ── preview cap for people without an account ─────────────────────────────
  {
    const jobs = Array.from({ length: 10 }, (_, i) => job(i + 1));
    const { ctx, writes } = makeCtx({ jobs });
    const result = await run(ctx, 'search_jobs', { role: 'cashier' });
    assert.equal(result.data.shown, 3);
    assert.equal(result.data.locked, 7);
    assert.equal(result.data.preview_jobs_left, 0);
    assert.match(ctx.attachments[0], /^1\. Cashier 1/);
    assert.match(ctx.attachments[0], /\+7 more/);
    assert.ok(!ctx.attachments[0].includes('Cashier 4'), 'locked jobs are not revealed');
    assert.deepEqual(writes.find((w) => w[0] === 'incrementViewCounter'), ['incrementViewCounter', 3]);
    assert.equal(ctx.memory.lastResults.length, 3);

    // Second search in the same turn sees the cap already spent.
    const again = await run(ctx, 'search_jobs', { role: 'driver' });
    assert.equal(again.data.status, 'preview_limit_reached');
    console.log('ok - no-account preview shows 3 jobs, locks the rest, then stops');
  }

  {
    const { ctx } = makeCtx({ lead: makeLead({ views_month_count: 3 }), jobs: [job(1)] });
    const result = await run(ctx, 'search_jobs', {});
    assert.equal(result.data.status, 'preview_limit_reached');
    assert.equal(ctx.attachments.length, 0);
    console.log('ok - exhausted preview offers signup instead of results');
  }

  {
    const jobs = Array.from({ length: 10 }, (_, i) => job(i + 1));
    const { ctx } = makeCtx({ lead: makeLead({ linked_user_id: 'u1', views_month_count: 8 }), jobs });
    const result = await run(ctx, 'search_jobs', {});
    assert.equal(result.data.shown, 2, 'free account: 10/month, 8 used');
    assert.equal(result.data.monthly_free_views_left, 0);

    const sub = makeCtx({ lead: makeLead({ linked_user_id: 'u1', views_month_count: 50 }), jobs, subscribed: true });
    const subResult = await run(sub.ctx, 'search_jobs', {});
    assert.equal(subResult.data.shown, 10);
    console.log('ok - account holders get the existing monthly limits');
  }

  // ── shadow mode never writes ──────────────────────────────────────────────
  {
    const jobs = [job(1), job(2)];
    const { ctx, writes } = makeCtx({ jobs, dryRun: true, inboundText: 'yes',
      memory: { signupDraft: { fullName: 'Ada N', role: 'job_seeker', email: 'ada@x.cm' } } });
    await run(ctx, 'search_jobs', { role: 'cashier' });
    const confirm = await run(ctx, 'confirm_signup');
    assert.equal(confirm.data.status, 'dry_run');
    assert.deepEqual(writes, []);
    console.log('ok - dry run searches and confirms without a single write');
  }

  // ── job_details reference resolution ──────────────────────────────────────
  {
    const jobs = [job(1, { title: 'Cashier' }), job(2, { title: 'Delivery driver' })];
    const { ctx } = makeCtx({ jobs, memory: {
      lastResults: [
        { n: 1, id: 'id-1', publicId: 'JL-1001', title: 'Cashier' },
        { n: 2, id: 'id-2', publicId: 'JL-1002', title: 'Delivery driver' },
      ],
    } });
    assert.equal((await run(ctx, 'job_details', { ref: '2' })).data.ref, 'JL-1002');
    assert.equal((await run(ctx, 'job_details', { ref: 'number 1 please' })).data.ref, 'JL-1001');
    assert.equal((await run(ctx, 'job_details', { ref: 'jl 1002' })).data.ref, 'JL-1002');
    assert.equal((await run(ctx, 'job_details', { ref: 'the driver one' })).data.ref, 'JL-1002');
    const miss = await run(ctx, 'job_details', { ref: '7' });
    assert.equal(miss.ok, false);
    assert.equal(miss.data.error, 'job_not_found');
    assert.match(ctx.attachments[0], /To apply: APPLY JL-1002/);
    console.log('ok - job refs resolve by position, ID and title words');
  }

  // ── signup: draft, then code-checked confirmation ─────────────────────────
  {
    const { ctx, writes } = makeCtx({ inboundText: 'my email is ada@x.cm' });
    const bad = await run(ctx, 'prepare_signup', { full_name: 'Ada N', role: 'job_seeker', email: 'not-an-email' });
    assert.equal(bad.data.error, 'invalid_email');

    const prepared = await run(ctx, 'prepare_signup', { full_name: 'Ada N', role: 'job_seeker', email: 'Ada@X.cm' });
    assert.equal(prepared.data.status, 'awaiting_confirmation');
    assert.equal(ctx.memory.signupDraft.email, 'ada@x.cm');

    // Model calls confirm in the same turn, but the user has not said yes.
    const premature = await run(ctx, 'confirm_signup');
    assert.equal(premature.data.error, 'not_confirmed');
    assert.equal(writes.length, 0);

    ctx.inboundText = 'Oui !';
    const confirmed = await run(ctx, 'confirm_signup');
    assert.equal(confirmed.data.status, 'link_sent');
    assert.equal(writes[0][1].email, 'ada@x.cm');
    assert.equal(writes[0][1].phone, '+237670000001');
    assert.match(ctx.attachments.at(-1), /complete-registration\/tok/);
    assert.equal(ctx.memory.signupDraft, null);
    console.log('ok - signup needs a draft and a real yes before anything is created');
  }

  {
    const { ctx } = makeCtx({ lead: makeLead({ linked_user_id: 'u1' }) });
    const result = await run(ctx, 'prepare_signup', { full_name: 'Ada', role: 'job_seeker', email: 'a@b.cm' });
    assert.equal(result.data.error, 'already_has_account');
    console.log('ok - linked numbers cannot start a second signup');
  }

  for (const yes of ['yes', 'YES', 'Oui', 'ok', "c'est bon", 'Yes!', 'oui 👍']) {
    assert.equal(tools.isAffirmative(yes), true, yes);
  }
  for (const no of ['no', 'non', 'yes but change my email', 'maybe', '']) {
    assert.equal(tools.isAffirmative(no), false, no);
  }
  console.log('ok - affirmative detection is strict');

  // ── argument validation ───────────────────────────────────────────────────
  {
    const { ctx } = makeCtx();
    assert.equal((await tools.executeTool(ctx, 'drop_tables', '{}')).data.error, 'unknown_tool:drop_tables');
    assert.equal((await tools.executeTool(ctx, 'search_jobs', '{not json')).data.error, 'arguments_not_json');
    assert.equal((await run(ctx, 'search_jobs', { type: 'gig' })).data.error, 'invalid_arguments');
    const menu = await run(ctx, 'show_menu');
    assert.equal(menu.ok, true);
    assert.equal(ctx.nextState, 'menu');
    console.log('ok - bad tool calls come back as recoverable errors');
  }
}

async function phase2() {
  const listed = {
    lastResults: [
      { n: 1, id: 'id-1', publicId: 'JL-1001', title: 'Cashier 1' },
      { n: 2, id: 'id-2', publicId: 'JL-1002', title: 'Cashier 2' },
    ],
  };
  const jobs = [job(1), job(2)];
  const withAccount = () => makeLead({ linked_user_id: 'u1' });

  // ── apply_to_job ──────────────────────────────────────────────────────────
  {
    const { ctx, writes } = makeCtx({ jobs, memory: listed, inboundText: 'what about the second one?', lead: withAccount() });
    const offer = await run(ctx, 'apply_to_job', { ref: '2' });
    assert.equal(offer.data.status, 'needs_confirmation', 'not asked to apply -> ask first');
    assert.equal(ctx.memory.proposedApply, 'JL-1002');
    assert.equal(ctx.followUp, null);

    ctx.inboundText = 'yes';
    const yes = await run(ctx, 'apply_to_job', { ref: '2' });
    assert.equal(yes.data.status, 'submitting');
    assert.deepEqual(ctx.followUp, { type: 'apply', publicId: 'JL-1002' });
    assert.equal(ctx.memory.proposedApply, null);
    assert.deepEqual(writes, [], 'the tool itself never writes; the router applies');
  }
  {
    const { ctx } = makeCtx({ jobs, memory: { ...listed, proposedApply: 'JL-1002' }, inboundText: 'yes', lead: withAccount() });
    const stray = await run(ctx, 'apply_to_job', { ref: '1' });
    assert.equal(stray.data.status, 'needs_confirmation', 'a yes to a different offer is not consent');
  }
  {
    const { ctx } = makeCtx({ jobs, memory: listed, inboundText: 'please apply to the 1st one', lead: withAccount() });
    assert.equal((await run(ctx, 'apply_to_job', { ref: '1' })).data.status, 'submitting', 'explicit request applies directly');
    const dry = makeCtx({ jobs, memory: listed, inboundText: 'postuler au 1', lead: withAccount(), dryRun: true });
    await run(dry.ctx, 'apply_to_job', { ref: '1' });
    assert.equal(dry.ctx.followUp, null, 'shadow never applies');
  }
  {
    const { ctx, writes } = makeCtx({ jobs, memory: listed, inboundText: 'apply to 2' });
    const result = await run(ctx, 'apply_to_job', { ref: '2' });
    assert.equal(result.data.status, 'needs_account');
    assert.deepEqual(writes[0], ['storePendingApply', 'lead-1', 'id-2', 'JL-1002'], 'job saved for after signup');
    assert.equal(ctx.followUp, null);
  }
  console.log('ok - apply_to_job: explicit ask or a yes to that exact offer; no account -> saved for later');

  // ── faq ───────────────────────────────────────────────────────────────────
  {
    const { ctx } = makeCtx();
    const plans = await run(ctx, 'faq', { topic: 'plans_and_prices' });
    assert.deepEqual(plans.data.plans, [{ name: 'Seeker Monthly', price_xaf: 2000, days: 30 }]);
    assert.equal(ctx.attachments[0], 'https://joblinca.com/pricing?role=job_seeker');
    const limits = await run(ctx, 'faq', { topic: 'free_limits' });
    assert.match(limits.data.free_account, /10 job views and 4 applications/);
    await run(ctx, 'faq', { topic: 'cv_upload' });
    assert.equal(ctx.attachments.at(-1), 'https://joblinca.com/dashboard/job-seeker/profile\nhttps://joblinca.com/resume');
    assert.equal((await run(ctx, 'faq', { topic: 'salary_negotiation' })).data.error, 'invalid_arguments');
  }
  console.log('ok - faq answers from live plans and real limits, links attached');

  // ── report_job ────────────────────────────────────────────────────────────
  {
    const anon = makeCtx({ jobs, memory: listed });
    assert.equal((await run(anon.ctx, 'report_job', { ref: '1', reason: 'scam' })).data.error, 'needs_account');

    const { ctx, writes } = makeCtx({ jobs, memory: listed, lead: withAccount() });
    const ok = await run(ctx, 'report_job', { ref: '1', reason: 'scam', details: 'asked me to pay 10,000 for training' });
    assert.equal(ok.data.status, 'reported');
    assert.deepEqual(writes[0][1], {
      jobId: 'id-1',
      reporterId: 'u1',
      reason: 'scam',
      description: '[via WhatsApp] asked me to pay 10,000 for training',
    });

    const dup = makeCtx({ jobs, memory: listed, lead: withAccount(), reportResult: { status: 'duplicate' } });
    assert.equal((await run(dup.ctx, 'report_job', { ref: '1', reason: 'scam' })).data.error, 'duplicate');
  }
  console.log('ok - report_job needs an account and goes through the shared report path');

  // ── handoff_to_human ──────────────────────────────────────────────────────
  {
    const { ctx, writes } = makeCtx();
    const result = await run(ctx, 'handoff_to_human', { reason: 'scam_or_safety', summary: 'Was asked to pay a recruiter.' });
    assert.equal(result.data.status, 'handed_off');
    const alert = writes.find((w) => w[0] === 'alertAdmins')[1];
    assert.ok(alert.includes('Ada Nkem · +237670000001 · no account'), alert);
    assert.ok(alert.includes('REPLY +237670000001 <your message>'));
    assert.ok(alert.includes('RESUME +237670000001'));
    const pause = writes.find((w) => w[0] === 'pauseLead');
    assert.equal(pause[1], 'lead-1');
    const hours = (new Date(pause[2]).getTime() - Date.now()) / 3600000;
    assert.ok(hours > 23.9 && hours <= 24, 'paused for 24h');

    const nobody = makeCtx({ alertResult: { configured: false, sent: 0 } });
    const unreachable = await run(nobody.ctx, 'handoff_to_human', { reason: 'asked_for_human', summary: 'x' });
    assert.equal(unreachable.data.error, 'team_unreachable');
    assert.ok(!nobody.writes.some((w) => w[0] === 'pauseLead'), 'no pause when no admin was told');

    const dry = makeCtx({ dryRun: true });
    await run(dry.ctx, 'handoff_to_human', { reason: 'asked_for_human', summary: 'x' });
    assert.deepEqual(dry.writes, []);
  }
  console.log('ok - handoff alerts admins with REPLY/RESUME, pauses 24h, never pauses into the void');
}

main()
  .then(phase2)
  .then(() => console.log('All wa-agent tools tests passed.'))
  .catch((error) => {
    console.error('Test failure:', error instanceof Error ? error.stack : error);
    process.exit(1);
  });
