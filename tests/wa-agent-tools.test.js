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

function makeCtx({ lead = makeLead(), dryRun = false, subscribed = false, inboundText = 'hi', jobs = [], memory = {} } = {}) {
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

main()
  .then(() => console.log('All wa-agent tools tests passed.'))
  .catch((error) => {
    console.error('Test failure:', error instanceof Error ? error.stack : error);
    process.exit(1);
  });
