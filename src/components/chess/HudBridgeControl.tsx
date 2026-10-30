'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { getHudBridge, type HudBridgeStatus, type HudOrientation } from '@/lib/hudBridge';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** The shared board provides authoritative full FEN and suppresses dragging/promotion frames. */
export function useHudBoard(fen: string, orientation: HudOrientation, blocked: boolean, element: RefObject<HTMLElement>) {
  const id = useRef<string>('');
  useClientLayoutEffect(() => {
    const bridge = getHudBridge();
    if (!bridge) return;
    id.current ||= crypto.randomUUID();
    bridge.update(id.current, {
      fen, orientation, blocked,
      visible: () => {
        const node = element.current;
        if (!node?.isConnected) return false;
        const rect = node.getBoundingClientRect();
        // A partly hidden board is not an authoritative picture of a playable position.
        return rect.width > 100 && rect.height > 100 && rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth;
      },
    });
  }, [fen, orientation, blocked, element]);
  useEffect(() => () => { if (id.current) getHudBridge()?.remove(id.current); }, []);
}

const LABEL: Record<HudBridgeStatus, string> = {
  off: 'Выключен', connecting: 'Подключение…', connected: 'Локальная связь включена', unavailable: 'HUD недоступен — проверь ключ и запуск',
};

export function HudBridgeControl() {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<HudBridgeStatus>('off');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const bridge = getHudBridge();
    setSupported(Boolean(bridge));
    if (!bridge) return;
    setStatus(bridge.getStatus());
    return bridge.subscribe(() => setStatus(bridge.getStatus()));
  }, []);
  if (!supported) return null;
  return <details style={{ position: 'relative' }}>
    <summary className="home-sound" style={{ cursor: 'pointer', listStyle: 'none' }} aria-label="Подключение локального HUD">HUD</summary>
    <div style={{ position: 'absolute', zIndex: 100, top: 'calc(100% + 12px)', right: 0, width: 310, padding: 18, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 12px 40px #0004' }}>
      <p style={{ margin: '0 0 10px', fontWeight: 650 }}>Локальный nonchalant HUD</p>
      <p style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>Передаёт полную позицию видимой доски в запущенный HUD на этом Mac. Ключ действует до перезапуска HUD. После обновления страницы подключись снова.</p>
      <label style={{ display: 'block', fontSize: 12 }}>Ключ из настроек HUD
        <input aria-label="Ключ локального HUD" type="password" autoComplete="off" spellCheck={false} value={token} onChange={event => { setToken(event.target.value); setError(''); }} placeholder="64 символа" style={{ width: '100%', margin: '7px 0', padding: 8, border: '1px solid var(--line)', borderRadius: 6, color: 'var(--ink)', background: 'var(--soft)' }} />
      </label>
      <button type="button" className="home-sound" onClick={() => {
        if (status !== 'off') { getHudBridge()?.disable(); return; }
        try { getHudBridge()?.enable(token); setToken(''); setError(''); }
        catch (caught) { setError(caught instanceof Error ? caught.message : 'Проверь ключ.'); }
      }}>{status === 'off' ? 'Подключить' : 'Отключить'}</button>
      <p role="status" style={{ fontSize: 12, margin: '10px 0 0', color: error ? '#d77373' : 'var(--muted)' }}>{error || LABEL[status]}</p>
      <p style={{ fontSize: 11, marginTop: 10, color: 'var(--muted)' }}>Оставь одну доску целиком видимой. Несколько досок или вкладок, перетаскивание и скрытая страница приостанавливают проверку.</p>
    </div>
  </details>;
}
