import { supabase } from './supabase';

export type ReviewActionName = 'preview' | 'broadcast' | 'repush' | 'takedown' | 'resolve';

export interface PreviewResult {
  ok: true;
  action: 'preview';
  status: string;
  targeted: number;
  radius_km: number;
  has_location: boolean;
}

export interface ActionResult {
  ok?: boolean;
  error?: string;
  /** The action was a no-op because someone else already did it. */
  already?: boolean;
  message?: string;
  status?: string;
  /** broadcast: the alert went public even if the push then failed. */
  published?: boolean;
  pushed?: boolean;
  targeted?: number;
  sent?: number;
  push_error?: string;
  radius_km?: number;
  has_location?: boolean;
  /** takedown/resolve: whether the alert had actually gone out, and so whether
   *  a retraction was sent to the phones that received it. */
  retracted?: boolean;
  cancel_targeted?: number;
  cancel_sent?: number;
  cancel_error?: string;
}

/**
 * Calls the `review-action` Edge Function — the only path that can change an
 * alert's status. `functions.invoke` attaches the signed-in user's JWT, which
 * is what the function checks the staff role against.
 */
export async function reviewAction(body: {
  action: ReviewActionName;
  alert_id: string;
  note?: string;
}): Promise<ActionResult> {
  const { data, error } = await supabase.functions.invoke('review-action', { body });

  if (error) {
    // supabase-js surfaces any non-2xx as a generic "Edge Function returned a
    // non-2xx status code" and hides the real reason in the attached Response.
    // Showing an operator that generic string during an emergency is useless,
    // so dig the actual message out.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json();
        if (body?.error) return { error: String(body.error) };
      } catch { /* fall through to the generic message */ }
    }
    return { error: error.message };
  }

  return (data ?? {}) as ActionResult;
}
