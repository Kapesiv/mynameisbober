import { render, h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

interface FloorClearedPanelState {
  visible: boolean;
  isDungeonComplete: boolean;
  floor: number;
  totalFloors: number;
}

let panelState: FloorClearedPanelState = {
  visible: false,
  isDungeonComplete: false,
  floor: 0,
  totalFloors: 4,
};

let onContinue: (() => void) | null = null;
let onExit: (() => void) | null = null;
let rerenderPanel: (() => void) | null = null;

function FloorClearedComponent() {
  const [state, setState] = useState({ ...panelState });

  useEffect(() => {
    rerenderPanel = () => setState({ ...panelState });
    return () => { rerenderPanel = null; };
  }, []);

  if (!state.visible) return null;

  const isDone = state.isDungeonComplete;
  const title = isDone ? 'DUNGEON COMPLETE!' : 'FLOOR CLEARED!';
  const titleColor = isDone ? '#ffd700' : '#44dd44';

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', zIndex: 100,
    }}>
      <div style={{
        background: 'rgba(20,20,30,0.95)', border: '2px solid rgba(255,170,0,0.5)',
        borderRadius: '12px', padding: '32px 48px', textAlign: 'center',
        minWidth: '320px',
      }}>
        <div style={{
          fontSize: '28px', fontWeight: 'bold', color: titleColor,
          marginBottom: '8px', textShadow: '0 0 20px rgba(255,215,0,0.5)',
        }}>
          {title}
        </div>

        {!isDone && (
          <div style={{ fontSize: '14px', color: '#aaa', marginBottom: '24px' }}>
            Floor {state.floor + 1} of {state.totalFloors} cleared
          </div>
        )}

        {isDone && (
          <div style={{ fontSize: '14px', color: '#aaa', marginBottom: '24px' }}>
            You conquered the dungeon!
          </div>
        )}

        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
          {!isDone && (
            <button
              onClick={() => { onContinue?.(); }}
              style={{
                padding: '12px 24px', fontSize: '16px', fontWeight: 'bold',
                background: 'linear-gradient(180deg, #ff8800, #cc5500)',
                color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer',
              }}
            >
              Continue Deeper &rarr;
            </button>
          )}

          <button
            onClick={() => { onExit?.(); }}
            style={{
              padding: '12px 24px', fontSize: '16px',
              background: isDone
                ? 'linear-gradient(180deg, #ff8800, #cc5500)'
                : 'linear-gradient(180deg, #555, #333)',
              color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontWeight: isDone ? 'bold' : 'normal',
            }}
          >
            {isDone ? 'Return to Hub' : '\u2190 Exit with Loot'}
          </button>
        </div>
      </div>
    </div>
  );
}

let panelRoot: HTMLElement | null = null;

export function mountFloorClearedPanel(
  container: HTMLElement,
  callbacks: { onContinue: () => void; onExit: () => void },
) {
  onContinue = callbacks.onContinue;
  onExit = callbacks.onExit;
  panelRoot = document.createElement('div');
  panelRoot.id = 'floor-cleared-root';
  container.appendChild(panelRoot);
  render(<FloorClearedComponent />, panelRoot);
}

export function showFloorCleared(floor: number, totalFloors: number) {
  panelState = { visible: true, isDungeonComplete: false, floor, totalFloors };
  rerenderPanel?.();
}

export function showDungeonComplete() {
  panelState = { visible: true, isDungeonComplete: true, floor: 0, totalFloors: 0 };
  rerenderPanel?.();
}

export function hideFloorClearedPanel() {
  panelState = { ...panelState, visible: false };
  rerenderPanel?.();
}
