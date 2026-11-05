import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { cuentaRegresiva, nivelVencimiento, useNow } from '../utils';

export function Modal({ titulo, onClose, children, ancho }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  useEffect(() => {
    document.body.classList.add('con-modal');
    return () => document.body.classList.remove('con-modal');
  }, []);
  return createPortal(
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={ancho ? { maxWidth: ancho } : null} role="dialog" aria-label={titulo}>
        <div className="modal-head">
          <h3>{titulo}</h3>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export function Campo({ label, children, full }) {
  return (
    <label className={'campo' + (full ? ' full' : '')}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ClienteSelect({ value, onChange, vacio = 'Elegí un cliente', required, filtro }) {
  const clientes = useLiveQuery(() => db.clientes.orderBy('nombre').toArray(), []) || [];
  const lista = filtro ? clientes.filter(filtro) : clientes;
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} required={required}>
      <option value="">{vacio}</option>
      {lista.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
          {c.activo === false ? ' (inactivo)' : ''}
        </option>
      ))}
    </select>
  );
}

export function Countdown({ fecha, horasAviso = 24 }) {
  const now = useNow(1000);
  const cr = cuentaRegresiva(fecha, now);
  const nivel = nivelVencimiento(fecha, horasAviso, now);
  return <span className={`countdown ${nivel}`}>{cr.texto}</span>;
}

export function Vacio({ icono = '📭', children }) {
  return (
    <div className="vacio">
      <div className="vacio-ico">{icono}</div>
      <div>{children}</div>
    </div>
  );
}

export function Stat({ titulo, valor, sub, tono, onClick }) {
  return (
    <div className={`stat ${tono || ''} ${onClick ? 'clic' : ''}`} onClick={onClick}>
      <div className="stat-t">{titulo}</div>
      <div className="stat-v">{valor}</div>
      {sub && <div className="stat-s">{sub}</div>}
    </div>
  );
}

export function Barra({ valor, max }) {
  const p = max > 0 ? Math.min(100, (valor / max) * 100) : 0;
  return (
    <div className="barra" title={`${valor}/${max}`}>
      <div className={'barra-in' + (p >= 100 ? ' llena' : '')} style={{ width: p + '%' }} />
    </div>
  );
}

export const confirmar = (msg) => window.confirm(msg);
