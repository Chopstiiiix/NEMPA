import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { registerPush } from '../lib/push';
import EmergencyContacts from '../components/EmergencyContacts';
import ProfileCard from '../components/ProfileCard';
import DeleteAccount from '../components/DeleteAccount';
import type { User } from '@supabase/supabase-js';

// Only the address is remembered, never the password. The session itself always
// persists (see lib/supabase.ts) — on a phone, staying signed in is the baseline
// expectation, so this box is about not retyping your email, not about staying in.
const REMEMBERED_EMAIL = 'sparrowtell.remembered_email';

export default function Auth() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBERED_EMAIL) ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => localStorage.getItem(REMEMBERED_EMAIL) !== null);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'reset'>('signin');
  const [msg, setMsg] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

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

  /**
   * Password recovery by 6-digit code, not by link.
   *
   * A recovery *link* lands the session in Safari, not in the app — the user ends
   * up signed in somewhere they can't change anything from. verifyOtp keeps the
   * whole flow inside the app: request a code, type it in, set the new password.
   * Requires the Recovery email template to include {{ .Token }} (see
   * supabase/email-templates/) — a template with only {{ .ConfirmationURL }}
   * sends a link and no code, and this screen will have nothing to accept.
   */
  async function sendResetCode() {
    setBusy(true);
    setMsg('');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    // Deliberately the same message either way: telling a stranger whether an
    // address has an account here is an account-enumeration leak, and this is an
    // app where being a known user is itself sensitive.
    setMsg(error ? error.message : 'If that address has an account, a 6-digit code is on its way.');
    if (!error) setMode('reset');
  }

  async function applyNewPassword() {
    if (password.length < 6) { setMsg('Pick a password of at least 6 characters.'); return; }
    setBusy(true);
    setMsg('');
    // The code exchanges for a real session; only then can the password be set.
    const { error: otpErr } = await supabase.auth.verifyOtp({
      email: email.trim(), token: code.trim(), type: 'recovery',
    });
    if (otpErr) { setBusy(false); setMsg(otpErr.message); return; }
    const { error: updErr } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updErr) { setMsg(updErr.message); return; }
    setMsg('Password changed — you are signed in.');
    setCode('');
    setPassword('');
  }

  async function submit() {
    setMsg('');
    // Persist the choice on submit, not on every keystroke, so a half-typed
    // address never gets remembered.
    if (remember) localStorage.setItem(REMEMBERED_EMAIL, email.trim());
    else localStorage.removeItem(REMEMBERED_EMAIL);
    try {
      // Call directly — extracting these methods detaches `this` and throws.
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMsg(error.message);
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) setMsg(error.message);
        // With "Confirm email" ON, signUp returns a user but NO session —
        // don't claim we're signing in when we can't until they confirm.
        else if (data.session) setMsg('Account created — signing you in…');
        else setMsg('Account created. Check your email for the confirmation link, then sign in here.');
      }
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
        <ProfileCard userId={user.id} />
        <EmergencyContacts userId={user.id} />
        <DeleteAccount email={user.email ?? ''} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card" style={{ padding: 'var(--s5)' }}>
        <h1 className="page__title">
          {mode === 'signin' ? 'Sign in'
            : mode === 'signup' ? 'Create account'
            : mode === 'forgot' ? 'Reset password'
            : 'Enter your code'}
        </h1>
        <p className="page__sub">
          {mode === 'forgot' ? 'We will email you a 6-digit code'
            : mode === 'reset' ? 'Then choose a new password'
            : 'Access community alerts'}
        </p>

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

        {mode === 'reset' && (
          <div className="field">
            <label className="field__label" htmlFor="auth-code">6-digit code</label>
            <input
              id="auth-code"
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              style={{ letterSpacing: '0.4em', fontFamily: 'var(--font-mono)' }}
            />
          </div>
        )}

        {mode !== 'forgot' && (
          <div className="field">
            <label className="field__label" htmlFor="auth-password">
              {mode === 'reset' ? 'New password' : 'Password'}
            </label>
            <div className="input-reveal">
              <input
                id="auth-password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="input-reveal__btn"
                onClick={() => setShowPassword((s) => !s)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        )}

        {(mode === 'signin' || mode === 'signup') && (
          <label className="check">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Remember my email</span>
          </label>
        )}

        {msg && (
          <p
            className={`notice${/^(If that address|Password changed|Account created)/.test(msg) ? '' : ' notice--error'}`}
            style={{ marginTop: 'var(--s4)' }}
          >
            {msg}
          </p>
        )}

        <div style={{ marginTop: 'var(--s5)' }}>
          <button
            className="btn btn-primary btn--block btn--lg"
            disabled={busy}
            onClick={
              mode === 'forgot' ? () => void sendResetCode()
                : mode === 'reset' ? () => void applyNewPassword()
                : submit
            }
          >
            {busy ? 'Working…'
              : mode === 'signin' ? 'Sign in'
              : mode === 'signup' ? 'Sign up'
              : mode === 'forgot' ? 'Send code'
              : 'Set new password'}
          </button>
        </div>

        {mode === 'signin' && (
          <button
            className="btn btn--ghost btn--block"
            style={{ marginTop: 'var(--s3)' }}
            onClick={() => { setMsg(''); setPassword(''); setMode('forgot'); }}
          >
            Forgot password?
          </button>
        )}

        {mode === 'reset' && (
          <button
            className="btn btn--ghost btn--block"
            style={{ marginTop: 'var(--s3)' }}
            disabled={busy}
            onClick={() => void sendResetCode()}
          >
            Resend code
          </button>
        )}

        <button
          className="btn btn--ghost btn--block"
          style={{ marginTop: 'var(--s3)' }}
          onClick={() => {
            setMsg('');
            setCode('');
            setPassword('');
            setMode(mode === 'signin' ? 'signup' : mode === 'signup' ? 'signin' : 'signin');
          }}
        >
          {mode === 'signin' ? 'No account? Sign up'
            : mode === 'signup' ? 'Have an account? Sign in'
            : 'Back to sign in'}
        </button>
      </div>
    </div>
  );
}
