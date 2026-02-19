import { KokoroTTS } from 'kokoro-js';

let tts: KokoroTTS | null = null;

interface InitMessage {
  type: 'init';
}

interface GenerateMessage {
  type: 'generate';
  id: number;
  text: string;
  voiceId: string;
  speed?: number;
}

type WorkerMessage = InitMessage | GenerateMessage;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (info: any) => {
          const progress = typeof info.progress === 'number' ? info.progress / 100 : 0;
          const status = info.status ?? 'loading';
          (self as unknown as Worker).postMessage({
            type: 'init_progress',
            progress,
            status,
          });
        },
      });
      (self as unknown as Worker).postMessage({ type: 'init_done' });
    } catch (err) {
      (self as unknown as Worker).postMessage({ type: 'init_error', error: String(err) });
    }
    return;
  }

  if (msg.type === 'generate') {
    if (!tts) {
      (self as unknown as Worker).postMessage({ type: 'generate_error', id: msg.id, error: 'TTS not initialized' });
      return;
    }

    try {
      const result = await tts.generate(msg.text, {
        voice: msg.voiceId as any,
        speed: msg.speed ?? 1,
      });

      const audio = result.audio;
      const sampleRate = result.sampling_rate;

      (self as unknown as Worker).postMessage(
        { type: 'generate_done', id: msg.id, audio, sampleRate },
        { transfer: [audio.buffer] },
      );
    } catch (err) {
      (self as unknown as Worker).postMessage({ type: 'generate_error', id: msg.id, error: String(err) });
    }
  }
};
