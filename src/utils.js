import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

export const DIA = 86400000;

export const money = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(n) || 0);

export const fmtFecha = (d) =>
  d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
export const fmtFechaHora = (d) =>
  d ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

/** valor para <input type="datetime-local"> */
export const toLocalInput = (d = new Date()) => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
};
export const toDateInput = (d = new Date()) => toLocalInput(d).slice(0, 10);

export const inicioMes = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
export const finMes = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
export const inicioSemana = (d = new Date()) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dia = (x.getDay() + 6) % 7; // lunes = 0
  x.setDate(x.getDate() - dia);
  return x;
};
export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Re-render cada `ms` para cuentas regresivas en tiempo real */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function cuentaRegresiva(target, now = Date.now()) {
  let diff = new Date(target).getTime() - now;
  const vencido = diff < 0;
  diff = Math.abs(diff);
  const d = Math.floor(diff / DIA);
  const h = Math.floor((diff % DIA) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const txt = `${d > 0 ? d + 'd ' : ''}${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  return { vencido, dias: d, texto: vencido ? `Vencido hace ${txt}` : `Faltan ${txt}`, ms: vencido ? -diff : diff };
}

/** nivel: 'vencido' | 'pronto' (< horas aviso) | 'ok' */
export function nivelVencimiento(target, horasAviso = 24, now = Date.now()) {
  const diff = new Date(target).getTime() - now;
  if (diff < 0) return 'vencido';
  if (diff < horasAviso * 3600000) return 'pronto';
  return 'ok';
}

export function descargar(nombre, contenido, tipo = 'text/plain') {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** CSV con ';' y BOM para que Excel en español lo abra bien */
export function aCSV(filas, columnas) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columnas.map((c) => esc(c.titulo)).join(';');
  const body = filas.map((f) => columnas.map((c) => esc(typeof c.valor === 'function' ? c.valor(f) : f[c.valor])).join(';'));
  return '﻿' + [head, ...body].join('\n');
}

export function parseCSV(texto) {
  const t = texto.replace(/^﻿/, '');
  const sep = (t.split('\n')[0].match(/;/g) || []).length >= (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/** Comprime imagen a JPEG */
export async function comprimirImagen(file, max = 1600, calidad = 0.82) {
  const bmp = await createImageBitmap(file).catch(async () => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    return img;
  });
  const esc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * esc);
  c.height = Math.round(bmp.height * esc);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', calidad));
}

export function mapsLink(cliente) {
  if (cliente?.mapsUrl) return cliente.mapsUrl;
  if (cliente?.direccion) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cliente.direccion)}`;
  return null;
}
export function whatsappLink(tel, texto = '') {
  if (!tel) return null;
  let n = String(tel).replace(/\D/g, '');
  if (n.startsWith('0')) n = n.slice(1);
  if (!n.startsWith('54')) n = '549' + n;
  return `https://wa.me/${n}${texto ? '?text=' + encodeURIComponent(texto) : ''}`;
}

// ---------- Notificaciones ----------
export const esNativo = () => Capacitor.isNativePlatform();

async function LN() {
  const m = await import('@capacitor/local-notifications');
  return m.LocalNotifications;
}

export async function pedirPermisoNotificaciones() {
  if (esNativo()) {
    const ln = await LN();
    const r = await ln.requestPermissions();
    return r.display === 'granted';
  }
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

export function permisoNotificaciones() {
  if (esNativo()) return 'nativo';
  return 'Notification' in window ? Notification.permission : 'no-soportado';
}

export async function notificar(titulo, cuerpo) {
  if (esNativo()) {
    const ln = await LN();
    await ln.schedule({ notifications: [{ id: Math.floor(Math.random() * 2e9), title: titulo, body: cuerpo }] });
    return;
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification(titulo, { body: cuerpo, icon: 'icon-192.png', badge: 'icon-192.png' });
  } catch { /* sigue con fallback */ }
  new Notification(titulo, { body: cuerpo, icon: 'icon-192.png' });
}

/** En Android: agenda la notificación aunque la app esté cerrada */
export async function programarNotificacionNativa(id, titulo, cuerpo, fecha) {
  if (!esNativo()) return;
  const ln = await LN();
  try { await ln.cancel({ notifications: [{ id }] }); } catch { /* no existía */ }
  if (new Date(fecha).getTime() > Date.now()) {
    await ln.schedule({ notifications: [{ id, title: titulo, body: cuerpo, schedule: { at: new Date(fecha), allowWhileIdle: true } }] });
  }
}
export async function cancelarNotificacionNativa(id) {
  if (!esNativo()) return;
  const ln = await LN();
  try { await ln.cancel({ notifications: [{ id }] }); } catch { /* nada */ }
}
