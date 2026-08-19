import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

function isConfigured(url, key) {
  return Boolean(
    url &&
      key &&
      !url.includes('SEU_PROJECT_REF') &&
      key !== 'sua_chave_anon_publica'
  );
}

/** Lido antes do cliente consumir o hash/query do link de recuperação. */
export function readRecoveryFromUrl() {
  if (typeof window === 'undefined') return false;
  const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search || '');
  return (
    hash.get('type') === 'recovery' ||
    query.get('type') === 'recovery' ||
    query.get('reset') === '1' ||
    Boolean(query.get('code'))
  );
}

export const recoveryFromUrl = readRecoveryFromUrl();

async function createSupabase() {
  try {
    const cfg = await import('./config.js');
    const url = cfg.SUPABASE_URL;
    const key = cfg.SUPABASE_ANON_KEY;
    if (!isConfigured(url, key)) return null;
    return createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch {
    return null;
  }
}

export const supabase = await createSupabase();
