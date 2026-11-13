/**
 * Supabase client, session bootstrap and typed RPC access.
 *
 * Design note: this file never contains a rule. Every decision that matters —
 * who you are, what you may read, whether a checkpoint counts — is made by the
 * database (see supabase/migrations). The client just asks politely and
 * renders the answer. That is why shipping the publishable key in the browser
 * is safe.
 */

import { createClient, type RealtimeChannel, type Session } from '@supabase/supabase-js';
import type { RpcMap } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !publishableKey) {
  throw new Error(
    'Missing Supabase configuration. Copy .env.local.example to .env.local and fill in ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then restart `npm run dev`.'
  );
}

export const supabase = createClient(url, publishableKey, {
  auth: {
    // Students never type a password; the anonymous session in localStorage is
    // their identity, so it has to survive a refresh and renew itself.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: {
    // ~30 students: plenty of headroom, and keeps us well inside the free tier.
    params: { eventsPerSecond: 5 },
  },
});

// -----------------------------------------------------------------------------
// Session
// -----------------------------------------------------------------------------

let sessionPromise: Promise<Session | null> | null = null;

/**
 * Guarantees a signed-in session, creating an anonymous one on first visit.
 *
 * Deduplicated: several components calling this during the same render pass
 * share one network round trip, so a student never ends up with two auth users
 * (which would look like two different people to the database).
 */
export function ensureSession(): Promise<Session | null> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) return data.session;

      const { data: created, error } = await supabase.auth.signInAnonymously();
      if (error) {
        // The most common cause by far, and the error text alone is cryptic.
        if (error.message?.toLowerCase().includes('anonymous')) {
          throw new Error(
            'Anonymous sign-ins are disabled for this Supabase project. Enable them under ' +
              'Authentication → Sign In / Providers → Anonymous Sign-Ins, and press Save.'
          );
        }
        throw error;
      }
      return created.session;
    })().catch((err) => {
      // Let the next caller retry rather than caching a failure forever.
      sessionPromise = null;
      throw err;
    });
  }
  return sessionPromise;
}

/** Drops the local session. Used by "switch student" during testing. */
export async function clearSession(): Promise<void> {
  sessionPromise = null;
  await supabase.auth.signOut();
}

// -----------------------------------------------------------------------------
// RPC
// -----------------------------------------------------------------------------

/**
 * Calls one of the database functions, typed against RpcMap.
 *
 * Always ensures a session first — an RPC without one resolves auth.uid() to
 * null and comes back NO_SESSION, which is a confusing way to learn that the
 * page simply loaded too fast.
 */
export async function rpc<K extends keyof RpcMap>(
  name: K,
  args: RpcMap[K]['args'] = {} as RpcMap[K]['args']
): Promise<RpcMap[K]['returns']> {
  await ensureSession();

  const { data, error } = await supabase.rpc(name as string, args as Record<string, unknown>);

  if (error) {
    // 42501 is the database refusing on authorization grounds — a student
    // reaching an admin-only function. Surface it as a result rather than a
    // crash, so callers can branch on `code` uniformly.
    if (error.code === '42501') {
      return { ok: false, code: 'FORBIDDEN', message: error.message } as RpcMap[K]['returns'];
    }
    if (error.hint === 'RATE_LIMITED' || error.message?.includes('rate limit')) {
      return { ok: false, code: 'RATE_LIMITED', message: error.message } as RpcMap[K]['returns'];
    }
    throw error;
  }

  return data as RpcMap[K]['returns'];
}

// -----------------------------------------------------------------------------
// Realtime
// -----------------------------------------------------------------------------

/**
 * Subscribes to changes on a set of tables and calls `onChange` when any of
 * them move.
 *
 * Realtime respects RLS, so a student is only ever notified about rows they
 * were already allowed to see. The callback deliberately carries no payload:
 * every consumer re-reads through the normal queries, which keeps the database
 * the single source of truth (§16) and makes duplicate events harmless.
 */
export function subscribeToGame(tables: string[], onChange: () => void): RealtimeChannel {
  const channel = supabase.channel(`game-changes-${Math.random().toString(36).slice(2)}`);

  for (const table of tables) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange());
  }

  channel.subscribe((status) => {
    // On a flaky campus connection the socket will drop. Supabase retries by
    // itself; we refetch on the way back so nothing missed while offline stays
    // missing (§16 "Fetch missed updates after reconnecting").
    if (status === 'SUBSCRIBED') onChange();
  });

  return channel;
}

/** Tables the student home page cares about. */
export const STUDENT_TABLES = [
  'games',
  'groups',
  'group_members',
  'hints',
  'checkpoint_verifications',
  'notifications',
  'notification_recipients',
  'help_requests',
  'winners',
];

/** Tables the organizer dashboard cares about (everything students see, plus participants). */
export const ADMIN_TABLES = [...STUDENT_TABLES, 'participants'];

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

/**
 * Turns anything thrown by supabase-js into a sentence worth showing.
 *
 * Supabase rejects with a plain object ({ message, details, hint, code }), not
 * an Error. Code that assumed `instanceof Error` fell through to String(err)
 * and rendered the useless "[object Object]" — which cost two rounds of
 * debugging, because the real reason was in the object all along.
 */
export function describeError(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;

  if (err instanceof Error && err.message) return err.message;

  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const parts = [e.message, e.details, e.hint]
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    const code = typeof e.code === 'string' ? e.code : undefined;

    if (parts.length) return code ? `${parts.join(' — ')} (${code})` : parts.join(' — ');
    if (code) return `Database error ${code}`;

    try {
      return JSON.stringify(err);
    } catch {
      return 'Unknown error';
    }
  }

  return String(err);
}

/** True when the database simply does not have that function yet. */
export function isMissingFunction(err: unknown): boolean {
  const text = describeError(err);
  return /PGRST202|does not exist|Could not find the function/i.test(text);
}
