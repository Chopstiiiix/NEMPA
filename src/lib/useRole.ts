import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type Role = 'citizen' | 'moderator' | 'admin';

/**
 * The caller's role, read from `profiles`.
 *
 * This gates the Review tab's VISIBILITY only — it is not a security boundary.
 * Every status change goes through the `review-action` Edge Function, which
 * re-reads the role server-side and 403s a non-staff caller. Faking this in
 * devtools reveals an empty queue (the alerts RLS policy won't return other
 * people's pending reports) and buys nothing.
 */
export function useRole() {
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const read = async (userId?: string) => {
      if (!userId) {
        if (active) { setRole(null); setLoading(false); }
        return;
      }
      const { data } = await supabase
        .from('profiles').select('role').eq('id', userId).maybeSingle();
      if (active) { setRole((data?.role as Role) ?? 'citizen'); setLoading(false); }
    };

    void supabase.auth.getSession().then(({ data }) => read(data.session?.user?.id));

    // Signing out must drop the tab immediately, not on next reload.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      void read(session?.user?.id);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  return { role, isStaff: role === 'admin' || role === 'moderator', loading };
}
