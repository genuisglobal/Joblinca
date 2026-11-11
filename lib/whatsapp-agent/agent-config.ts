/**
 * Rollout switch for the conversational WhatsApp agent.
 *
 *   WA_AGENT_MODE            off (default) | shadow | on
 *   WA_AGENT_ALLOWLIST       comma-separated phones that always get the live
 *                            agent when mode is on (admin test numbers)
 *   WA_AGENT_ROLLOUT_PERCENT 0-100, share of other leads that get the live
 *                            agent when mode is on (default 0)
 *
 * Per lead the result is one of:
 *   off    -- the existing state machine answers; the agent never runs
 *   shadow -- the state machine answers; the agent runs too and its reply is
 *             logged to wa_agent_turns but never sent
 *   live   -- the agent answers, with the state machine as its fallback
 *
 * Shadow mode applies to every lead, so it yields a like-for-like comparison
 * before anyone sees an agent reply. Under `on`, leads outside the cohort are
 * plain `off`: once we are rolling out, paying for shadow turns stops being
 * useful.
 */

export type WaAgentMode = 'off' | 'shadow' | 'on';
export type WaAgentRoute = 'off' | 'shadow' | 'live';

export interface WaAgentConfig {
  mode: WaAgentMode;
  allowlist: Set<string>;
  rolloutPercent: number;
}

/** Digits only, so "+237 6 70..." and "237670..." compare equal. */
function phoneKey(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function readAgentConfig(env: Record<string, string | undefined> = process.env): WaAgentConfig {
  const rawMode = (env.WA_AGENT_MODE || '').trim().toLowerCase();
  const mode: WaAgentMode = rawMode === 'shadow' || rawMode === 'on' ? rawMode : 'off';

  const allowlist = new Set(
    (env.WA_AGENT_ALLOWLIST || '')
      .split(',')
      .map(phoneKey)
      .filter((value) => value.length > 0)
  );

  const percent = Number(env.WA_AGENT_ROLLOUT_PERCENT || '0');
  const rolloutPercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, Math.floor(percent))) : 0;

  return { mode, allowlist, rolloutPercent };
}

/**
 * Stable 0-99 bucket for a phone, so a lead stays in or out of the cohort
 * across messages and deploys as the percentage is raised. FNV-1a: cheap,
 * dependency-free, and evenly spread enough for a rollout gate.
 */
export function rolloutBucket(phone: string): number {
  let hash = 0x811c9dc5;
  for (const char of phoneKey(phone)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function decideAgentRoute(phone: string, config: WaAgentConfig = readAgentConfig()): WaAgentRoute {
  if (config.mode === 'off') return 'off';
  if (config.mode === 'shadow') return 'shadow';

  if (config.allowlist.has(phoneKey(phone))) return 'live';
  return rolloutBucket(phone) < config.rolloutPercent ? 'live' : 'off';
}
