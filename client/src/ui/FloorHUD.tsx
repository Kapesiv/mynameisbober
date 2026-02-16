import { render, h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

interface FloorHUDProps {
  getFloorInfo: () => FloorInfo | null;
}

export interface FloorInfo {
  currentFloor: number;
  totalFloors: number;
  floorName: string;
}

function FloorHUDComponent({ getFloorInfo }: FloorHUDProps) {
  const [info, setInfo] = useState<FloorInfo | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setInfo(getFloorInfo());
    }, 200);
    return () => clearInterval(interval);
  }, []);

  if (!info) return null;

  return (
    <div style={{
      position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.75)', padding: '6px 18px', borderRadius: '6px',
      pointerEvents: 'none', textAlign: 'center',
      border: '1px solid rgba(255,170,0,0.3)',
    }}>
      <div style={{ fontSize: '13px', color: '#ffa500', fontWeight: 'bold' }}>
        Floor {info.currentFloor + 1}/{info.totalFloors}
      </div>
      <div style={{ fontSize: '11px', color: '#ccc' }}>
        {info.floorName}
      </div>
    </div>
  );
}

let floorHudRoot: HTMLElement | null = null;

export function mountFloorHUD(container: HTMLElement, getFloorInfo: () => FloorInfo | null) {
  floorHudRoot = document.createElement('div');
  floorHudRoot.id = 'floor-hud-root';
  container.appendChild(floorHudRoot);
  render(<FloorHUDComponent getFloorInfo={getFloorInfo} />, floorHudRoot);
}

export function unmountFloorHUD() {
  if (floorHudRoot) {
    render(null, floorHudRoot);
    floorHudRoot.remove();
    floorHudRoot = null;
  }
}
