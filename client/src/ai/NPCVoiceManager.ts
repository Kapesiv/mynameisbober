const TTS_SAMPLE_RATE = 24000;

interface PendingRequest {
  resolve: (value: { audio: Float32Array; sampleRate: number }) => void;
  reject: (reason: unknown) => void;
}

export class NPCVoiceManager {
  private worker: Worker | null = null;
  private audioCtx: AudioContext | null = null;
  private playbackQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private nextId = 0;
  private pending = new Map<number, PendingRequest>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(onProgress?: (progress: number, status: string) => void): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._init(onProgress);
    return this.initPromise;
  }

  private async _init(onProgress?: (progress: number, status: string) => void): Promise<void> {
    this.worker = new Worker(
      new URL('./workers/tts-worker.ts', import.meta.url),
      { type: 'module' },
    );

    await new Promise<void>((resolve, reject) => {
      this.worker!.onmessage = (e) => {
        const msg = e.data;

        if (msg.type === 'init_progress') {
          onProgress?.(msg.progress, msg.status);
          return;
        }
        if (msg.type === 'init_done') {
          this.initialized = true;
          this.worker!.onmessage = this.handleMessage.bind(this);
          resolve();
          return;
        }
        if (msg.type === 'init_error') {
          reject(new Error(msg.error));
          return;
        }
      };

      this.worker!.postMessage({ type: 'init' });
    });

    this.audioCtx = new AudioContext({ sampleRate: TTS_SAMPLE_RATE });
  }

  get isReady(): boolean {
    return this.initialized;
  }

  private handleMessage(e: MessageEvent): void {
    const msg = e.data;

    if (msg.type === 'generate_done') {
      const req = this.pending.get(msg.id);
      if (req) {
        this.pending.delete(msg.id);
        req.resolve({ audio: msg.audio, sampleRate: msg.sampleRate });
      }
    } else if (msg.type === 'generate_error') {
      const req = this.pending.get(msg.id);
      if (req) {
        this.pending.delete(msg.id);
        req.reject(new Error(msg.error));
      }
    }
  }

  private generateAudio(text: string, voiceId: string): Promise<{ audio: Float32Array; sampleRate: number }> {
    if (!this.worker) return Promise.reject(new Error('TTS worker not initialized'));

    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ type: 'generate', id, text, voiceId });
    });
  }

  /** Generates TTS, queues audio for playback, returns duration in seconds. */
  async speakSentence(text: string, voiceId: string): Promise<number> {
    if (!this.audioCtx || !this.initialized) return 0;

    try {
      const { audio, sampleRate } = await this.generateAudio(text, voiceId);
      const duration = audio.length / sampleRate;
      const buffer = this.audioCtx.createBuffer(1, audio.length, sampleRate);
      buffer.getChannelData(0).set(audio);
      this.playbackQueue.push(buffer);
      this.drainQueue();
      return duration;
    } catch (err) {
      console.warn('TTS generation failed:', err);
      return 0;
    }
  }

  private drainQueue(): void {
    if (this.isPlaying || this.playbackQueue.length === 0 || !this.audioCtx) return;

    this.isPlaying = true;
    const buffer = this.playbackQueue.shift()!;
    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioCtx.destination);
    this.currentSource = source;

    source.onended = () => {
      this.isPlaying = false;
      this.currentSource = null;
      this.drainQueue();
    };

    source.start();
  }

  stopPlayback(): void {
    this.playbackQueue.length = 0;
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* already stopped */ }
      this.currentSource = null;
    }
    this.isPlaying = false;
  }
}
