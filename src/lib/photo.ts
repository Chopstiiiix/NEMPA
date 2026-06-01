import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { supabase } from './supabase';

/**
 * Capture/pick a photo on a native device via the Capacitor Camera plugin.
 * On web this is unreliable without @ionic/pwa-elements, so the ReportForm
 * uses a plain <input type="file"> fallback instead — see pickPhotoWeb usage.
 */
export async function pickPhotoNative(): Promise<Blob | null> {
  const photo = await Camera.getPhoto({
    quality: 70,
    resultType: CameraResultType.Uri,
    source: CameraSource.Prompt,
    allowEditing: false,
  });
  if (!photo.webPath) return null;
  const res = await fetch(photo.webPath);
  return await res.blob();
}

/**
 * Upload a report photo to the public `alert-photos` bucket and return its
 * public URL. Path is namespaced by user id (matches the storage RLS policy).
 */
export async function uploadAlertPhoto(blob: Blob, userId: string): Promise<string> {
  const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const path = `${userId}/${Date.now()}-${Math.round(performance.now())}.${ext}`;
  const { error } = await supabase.storage
    .from('alert-photos')
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (error) throw error;
  return supabase.storage.from('alert-photos').getPublicUrl(path).data.publicUrl;
}
