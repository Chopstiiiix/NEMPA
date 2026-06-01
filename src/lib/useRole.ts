import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { UserRole } from '../types';

export interface RoleState {
  userId: string | null;
  role: UserRole | null;
  isStaff: boolean;
  loading: boolean;
}

/**
 * Resolve the signed-in user's role from the `profiles` table.
 * Re-runs on auth changes AND when the tab regains focus, so a freshly
 * granted role (e.g. promotion to moderator) appears without a hard reload.
 */
export function useRole(): RoleState {
  const [state, setState] = useState<RoleState>({
    userId: null, role: null, isStaff: false, loading: true,
  });

  useEffect(() => {
    let active = true;

    async function resolve() {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) {
        if (active) setState({ userId: null, role: null, isStaff: false, loading: false });
        return;
      }
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single();
      const role = (profile?.role ?? 'citizen') as UserRole;
      if (active) {
        setState({
          userId: user.id,
          role,
          isStaff: role === 'moderator' || role === 'admin',
          loading: false,
        });
      }
    }

    resolve();
    const { data: sub } = supabase.auth.onAuthStateChange(() => resolve());
    const onFocus = () => { if (document.visibilityState === 'visible') resolve(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  return state;
}
