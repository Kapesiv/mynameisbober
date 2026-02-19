import { render, h } from 'preact';
import { useState } from 'preact/hooks';

interface LoadingState {
  visible: boolean;
  llmProgress: number;
  llmText: string;
  ttsProgress: number;
  ttsText: string;
}

const INITIAL: LoadingState = {
  visible: false,
  llmProgress: 0,
  llmText: 'Waiting...',
  ttsProgress: 0,
  ttsText: 'Waiting...',
};

let setState: ((updater: (s: LoadingState) => LoadingState) => void) | null = null;

function AILoadingOverlayComponent() {
  const [state, setStateLocal] = useState<LoadingState>(INITIAL);
  setState = setStateLocal;

  if (!state.visible) return null;

  const totalProgress = (state.llmProgress + state.ttsProgress) / 2;

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'auto',
      zIndex: 100,
    }}>
      <div style={{
        background: 'rgba(20,20,30,0.95)',
        border: '2px solid #ffd700',
        borderRadius: '16px',
        padding: '30px 40px',
        maxWidth: '450px',
        width: '90%',
        textAlign: 'center',
      }}>
        <div style={{ color: '#ffd700', fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>
          Loading AI Models
        </div>

        <div style={{ color: '#ccc', fontSize: '13px', marginBottom: '6px', textAlign: 'left' }}>
          Brain: {state.llmText}
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '4px',
          height: '8px',
          marginBottom: '14px',
          overflow: 'hidden',
        }}>
          <div style={{
            background: '#ffd700',
            height: '100%',
            width: `${Math.round(state.llmProgress * 100)}%`,
            borderRadius: '4px',
            transition: 'width 0.3s',
          }} />
        </div>

        <div style={{ color: '#ccc', fontSize: '13px', marginBottom: '6px', textAlign: 'left' }}>
          Voice: {state.ttsText}
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '4px',
          height: '8px',
          marginBottom: '20px',
          overflow: 'hidden',
        }}>
          <div style={{
            background: '#ffd700',
            height: '100%',
            width: `${Math.round(state.ttsProgress * 100)}%`,
            borderRadius: '4px',
            transition: 'width 0.3s',
          }} />
        </div>

        <div style={{ color: '#888', fontSize: '12px' }}>
          {totalProgress < 1
            ? `${Math.round(totalProgress * 100)}% - First time download, cached for future visits`
            : 'Almost ready...'}
        </div>
      </div>
    </div>
  );
}

export function mountAILoadingOverlay(container: HTMLElement) {
  const div = document.createElement('div');
  div.id = 'ai-loading-overlay-root';
  container.appendChild(div);
  render(<AILoadingOverlayComponent />, div);
}

export function showAILoading() {
  setState?.(() => ({ ...INITIAL, visible: true }));
}

export function hideAILoading() {
  setState?.(() => INITIAL);
}

export function updateLLMProgress(progress: number, text: string) {
  setState?.((s) => ({ ...s, llmProgress: progress, llmText: text }));
}

export function updateTTSProgress(progress: number, status: string) {
  setState?.((s) => ({ ...s, ttsProgress: progress, ttsText: status }));
}
