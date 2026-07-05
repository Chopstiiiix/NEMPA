/**
 * Background audio evidence recorder for danger alerts.
 *
 * Uses the WebView's MediaRecorder (works in Capacitor: Android's
 * BridgeWebChromeClient grants getUserMedia when the app holds
 * RECORD_AUDIO; iOS WKWebView supports it from 14.3 with
 * NSMicrophoneUsageDescription). Chunks accumulate in memory so the
 * whole take can be (re-)uploaded while recording continues.
 */
export class EvidenceRecorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mime = '';

  get recording() { return this.rec?.state === 'recording'; }

  /** File extension matching the mime type actually in use. */
  get ext(): 'webm' | 'mp4' {
    return this.mime.includes('mp4') ? 'mp4' : 'webm';
  }

  get mimeType() { return this.mime || 'audio/webm'; }

  /** Start capturing mic audio. Returns false if permission denied / unsupported. */
  async start(): Promise<boolean> {
    if (this.recording) return true;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Chrome/Android WebView → webm/opus; Safari/WKWebView → mp4/aac.
      this.mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
      this.chunks = [];
      this.rec = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined);
      this.rec.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
      this.rec.start(5000); // flush a chunk every 5s so uploads always have data
      return true;
    } catch (e) {
      console.error('recorder start failed', e);
      this.cleanup();
      return false;
    }
  }

  /** Snapshot of everything recorded so far (recording keeps going). */
  snapshot(): Blob | null {
    if (this.chunks.length === 0) return null;
    return new Blob(this.chunks, { type: this.mimeType });
  }

  /** Stop and return the final take. */
  async stop(): Promise<Blob | null> {
    const rec = this.rec;
    if (!rec || rec.state === 'inactive') { this.cleanup(); return this.snapshot(); }
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      try { rec.stop(); } catch { resolve(); }
    });
    const blob = this.snapshot();
    this.cleanup();
    return blob;
  }

  private cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
  }
}
