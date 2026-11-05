import { useEffect, useState } from 'react';

const leer = () => { try { return localStorage.getItem('ngp-tema') || 'dark'; } catch { return 'dark'; } };

export function aplicarTema(t) {
  const r = document.documentElement;
  if (t === 'system') delete r.dataset.theme; else r.dataset.theme = t;
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#150b11' : '#fbf6f8');
}

export function Tema() {
  const [t, setT] = useState(leer);
  useEffect(() => {
    aplicarTema(t);
    try { localStorage.setItem('ngp-tema', t); } catch { /* nada */ }
    window.dispatchEvent(new Event('ngp-tema'));
  }, [t]);
  const op = [
    ['light', '☀️', 'Claro'],
    ['dark', '🌙', 'Dark'],
    ['system', '🖥️', 'Sistema'],
  ];
  return (
    <div className="tema" role="group" aria-label="Tema">
      {op.map(([k, i, l]) => (
        <button key={k} className={t === k ? 'on' : ''} onClick={() => setT(k)} title={l} aria-pressed={t === k}>
          <span>{i}</span>{t === k && <b>{l}</b>}
        </button>
      ))}
    </div>
  );
}
