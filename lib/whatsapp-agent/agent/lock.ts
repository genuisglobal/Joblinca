import { createServiceSupabaseClient } from '@/lib/supabase/service';

type Db = Pick<ReturnType<typeof createServiceSupabaseClient>, 'from'>;

const LEASE_MS = 30000;
const WAIT_MS = 15000;
const POLL_MS = 400;

/**
 * Take this lead's agent lease, waiting up to WAIT_MS for a turn already in
 * progress. A lease expires by itself after LEASE_MS, so a crashed turn can
 * delay the next message but never block it for good.
 *
 * Fails open: if the lease cannot be taken (timeout, or the column does not
 * exist yet) the turn runs anyway. A rare race is better than a silent bot.
 * Returns a release function that is always safe to call.
 */
export async function acquireLeadLock(
  leadId: string,
  options: { db?: Db; sleep?: (ms: number) => Promise<void>; now?: () => number } = {}
): Promise<{ acquired: boolean; release: () => Promise<void> }> {
  const db = options.db ?? createServiceSupabaseClient();
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + WAIT_MS;

  for (;;) {
    const nowIso = new Date(now()).toISOString();
    const { data, error } = await db
      .from('wa_leads')
      .update({ agent_lock_until: new Date(now() + LEASE_MS).toISOString() })
      .eq('id', leadId)
      .or(`agent_lock_until.is.null,agent_lock_until.lt.${nowIso}`)
      .select('id');

    if (error) {
      console.warn('[wa-agent-lock] lease unavailable, continuing unlocked', { error: error.message });
      return { acquired: false, release: async () => {} };
    }

    if (Array.isArray(data) && data.length > 0) {
      return {
        acquired: true,
        release: async () => {
          await db.from('wa_leads').update({ agent_lock_until: null }).eq('id', leadId);
        },
      };
    }

    if (now() >= deadline) {
      console.warn('[wa-agent-lock] timed out waiting for lease, continuing unlocked', { leadId });
      return { acquired: false, release: async () => {} };
    }
    await sleep(POLL_MS);
  }
}
