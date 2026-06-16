import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { registerPush } from '../lib/push';
import type { User } from '@supabase/supabase-js';

export default function Auth() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    // Use getSession() (reads local/in-memory session, no network) — NOT getUser(),
    // whose network call can resolve to null in the WKWebView and clobber the real
    // session set by onAuthStateChange, falsely showing the user as signed out.
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) registerPush(session.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit() {
    setMsg('');
    try {
      // Call directly — extracting these methods detaches `this` and throws.
      const { error } = mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
      if (error) setMsg(error.message);
      else if (mode === 'signup') setMsg('Account created — signing you in…');
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  if (user) {
    return (
      <div className="page">
        <h1 className="page__title">Account</h1>
        <p className="page__sub">Session active</p>
        <div className="card" style={{ padding: 'var(--s5)' }}>
          <span className="mono" style={{ display: 'block', marginBottom: 'var(--s2)' }}>
            Signed in as
          </span>
          <p style={{ marginBottom: 'var(--s5)', wordBreak: 'break-all' }}>{user.email}</p>
          <button className="btn btn--ghost btn--block" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card" style={{ padding: 'var(--s5)' }}>
        <h1 className="page__title">{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
        <p className="page__sub">Access community alerts</p>

        <div className="field">
          <label className="field__label" htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
          />
        </div>

        {msg && <p className="notice notice--error" style={{ marginTop: 'var(--s4)' }}>{msg}</p>}

        <div style={{ marginTop: 'var(--s5)' }}>
          <button className="btn btn-primary btn--block btn--lg" onClick={submit}>
            {mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </div>

        <button
          className="btn btn--ghost btn--block"
          style={{ marginTop: 'var(--s3)' }}
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        >
          {mode === 'signin' ? 'No account? Sign up' : 'Have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
