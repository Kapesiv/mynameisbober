import { render, h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';

let triggerEffect: ((level: number) => void) | null = null;

function LevelUpComponent() {
  const [visible, setVisible] = useState(false);
  const [level, setLevel] = useState(1);
  const [opacity, setOpacity] = useState(1);

  const show = useCallback((newLevel: number) => {
    setLevel(newLevel);
    setVisible(true);
    setOpacity(1);

    // Fade out over 2 seconds
    const start = Date.now();
    const duration = 2000;
    const fade = () => {
      const elapsed = Date.now() - start;
      if (elapsed >= duration) {
        setVisible(false);
        return;
      }
      // Hold full opacity for first 800ms, then fade
      const fadeStart = 800;
      if (elapsed < fadeStart) {
        setOpacity(1);
      } else {
        setOpacity(1 - (elapsed - fadeStart) / (duration - fadeStart));
      }
      requestAnimationFrame(fade);
    };
    requestAnimationFrame(fade);
  }, []);

  useEffect(() => {
    triggerEffect = show;
    return () => { triggerEffect = null; };
  }, [show]);

  if (!visible) return null;

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none', zIndex: 90,
      opacity,
    }}>
      {/* Flash overlay */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        background: 'radial-gradient(ellipse at center, rgba(255,215,0,0.3) 0%, rgba(255,215,0,0) 70%)',
      }} />

      {/* Text */}
      <div style={{
        textAlign: 'center', zIndex: 1,
      }}>
        <div style={{
          fontSize: '48px', fontWeight: 'bold', color: '#ffd700',
          textShadow: '0 0 30px rgba(255,215,0,0.8), 0 0 60px rgba(255,170,0,0.4)',
          letterSpacing: '4px',
        }}>
          LEVEL UP!
        </div>
        <div style={{
          fontSize: '28px', color: '#fff',
          textShadow: '0 0 20px rgba(255,215,0,0.6)',
          marginTop: '8px',
        }}>
          Level {level}
        </div>
      </div>
    </div>
  );
}

let effectRoot: HTMLElement | null = null;

export function mountLevelUpEffect(container: HTMLElement) {
  effectRoot = document.createElement('div');
  effectRoot.id = 'level-up-effect-root';
  container.appendChild(effectRoot);
  render(<LevelUpComponent />, effectRoot);
}

export function showLevelUp(level: number) {
  triggerEffect?.(level);
}
