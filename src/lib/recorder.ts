/**
 * Segmented audio recorder for SOS and danger alerts.
 *
 * Uses the WebView's MediaRecorder (works in Capacitor: Android's
 * BridgeWebChromeClient grants getUserMedia when the app holds RECORD_AUDIO;
 * iOS WKWebView supports it from 14.3 with NSMicrophoneUsageDescription).
 *
 * ⚠️ Why the recorder is restarted for every segment rather than using
 * `start(timeslice)` and uploading each chunk:
 *
 * MediaRecorder chunks are NOT independently playable. Only the first carries
 * the container header — the WebM clusters or MP4 fragments that follow are
 * undecodable on their own. The previous implementation sidestepped this by
 * always concatenating from chunk zero and re-uploading the entire take, which
 * is correct but grows without bound: a long SOS re-uploads an ever-larger
 * file every 20 seconds, over the connection of someone in trouble.
 *
 * Stopping and restarting yields a complete, standalone file per segment, so
 * an operator can play each one the moment it lands. The cost is a gap of a
 * few tens of milliseconds at each boundary while the encoder cycles. For
 * situational audio — what is being said, how many voices, is it escalating —
 * that is not a meaningful loss, and it buys near-live listening without the
 * signalling, TURN servers and battery cost of WebRTC.
 */

/** Segment length. Shorter = lower latency, more requests on a bad connection. */
const SEGMENT_MS = 8000;

export type SegmentHandler = (blob: Blob, seq: number, ext: 'webm' | 'mp4') => void;

export class EvidenceRecorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private mime = '';
  private seq = 0;
  private rotateTimer: ReturnType<typeof setTimeout> | null = null;
  private onSegment: SegmentHandler | null = null;
  private stopping = false;

  /**
   * Why the last start() failed, in words a non-engineer can act on. Surfaced
   * on the SOS overlay: the first live test recorded nothing and gave the user
   * no indication at all, which for a safety feature is worse than the bug.
   */
  lastError: string | null = null;

  get recording() { return this.rec?.state === 'recording'; }

  /** File extension matching the mime type actually in use. */
  get ext(): 'webm' | 'mp4' {
    return this.mime.includes('mp4') ? 'mp4' : 'webm';
  }

  get mimeType() { return this.mime || 'audio/webm'; }

  /**
   * Start capturing. `onSegment` fires with each completed segment, in order,
   * starting at seq 1. Returns false if permission was denied or the platform
   * has no MediaRecorder.
   */
  async start(onSegment: SegmentHandler): Promise<boolean> {
    this.lastError = null;
    if (this.recording) return true;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.lastError = 'not supported on this device';
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Chrome/Android WebView → webm/opus; Safari/WKWebView → mp4/aac.
      this.mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
      this.onSegment = onSegment;
      this.seq = 0;
      this.stopping = false;
      this.beginSegment();
      return true;
    } catch (e) {
      console.error('recorder start failed', e);
      const name = (e as { name?: string })?.name;
      this.lastError = name === 'NotAllowedError'
        ? 'microphone permission denied'
        : name === 'NotFoundError'
          ? 'no microphone found'
          : 'microphone unavailable';
      this.cleanup();
      return false;
    }
  }

  private beginSegment() {
    if (!this.stream || this.stopping) return;
    const parts: Blob[] = [];
    const rec = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined);
    this.rec = rec;

    rec.ondataavailable = (e) => { if (e.data.size > 0) parts.push(e.data); };
    rec.onstop = () => {
      if (parts.length > 0) {
        this.seq += 1;
        try {
          this.onSegment?.(new Blob(parts, { type: this.mimeType }), this.seq, this.ext);
        } catch (e) {
          // A failed upload must never stop the recording — the next segment
          // still needs to go out.
          console.error('segment handler failed', e);
        }
      }
      // Chain the next segment from onstop rather than the timer, so a slow
      // encoder can never leave two recorders running against one stream.
      if (!this.stopping) this.beginSegment();
    };

    try {
      rec.start();
      this.rotateTimer = setTimeout(() => {
        if (rec.state === 'recording') { try { rec.stop(); } catch { /* noop */ } }
      }, SEGMENT_MS);
    } catch (e) {
      console.error('segment start failed', e);
    }
  }

  /** Stop recording. The final partial segment is flushed through onSegment. */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.rotateTimer) { clearTimeout(this.rotateTimer); this.rotateTimer = null; }
    const rec = this.rec;
    if (rec && rec.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        const prior = rec.onstop;
        rec.onstop = (ev) => { try { prior?.call(rec, ev as Event); } finally { resolve(); } };
        try { rec.stop(); } catch { resolve(); }
      });
    }
    this.cleanup();
  }

  private cleanup() {
    if (this.rotateTimer) { clearTimeout(this.rotateTimer); this.rotateTimer = null; }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
    this.onSegment = null;
  }
}
