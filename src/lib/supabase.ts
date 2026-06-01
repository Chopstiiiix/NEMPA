import { createClient, processLock } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn('Missing Supabase env vars. Copy .env.example to .env and fill them in.');
}

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Use an in-memory lock instead of the browser Web Locks API. navigator.locks
    // can stall inside iOS WKWebView once a session exists, which blocks every
    // auth-gated query and makes pages hang/load slowly. Safe here (single webview).
    lock: processLock,
  },
});
