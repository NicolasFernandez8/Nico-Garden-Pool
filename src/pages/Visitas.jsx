import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Campo, ClienteSelect, Modal, Vacio, confirmar } from '../components/ui';
import { DIA, finMes, fmtFechaHora, mapsLink, toLocalInput, whatsappLink } from '../utils';

export function VisitaForm({ inicial = {}, onClose }) {
  const [f, setF] = useState({ clienteId: null, fecha: toLocalInput(), tipo: 'pileta', estado: 'programada', repetirDias: '', tareas: '', notas: '', ...inicial });
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  async function guardar(e) {
    e.preventDefault();
    const base = { clienteId: Number(f.clienteId), tipo: f.tipo, estado: f.estado, tareas: f.tareas, notas: f.notas };
    if (f.id) {
      await db.visitas.update(f.id, { ...base, fecha: new Date(f.fecha).toISOString() });
    } else {
      const fechas = [new Date(f.fecha)];
      const r = Number(f.repetirDias);
      if (r > 0) {
        const lim = finMes(new Date(f.fecha)).getTime();
        let t = fechas[0].getTime() + r * DIA;
        while (t < lim) { fechas.push(new Date(t)); t += r * DIA; }
      }
      await db.visitas.bulkAdd(fechas.map((d) => ({ ...base, fecha: d.toISOString() })));
    }
    onClose();
  }
  return (
    <Modal titulo={f.id ? 'Editar visita' : 'Programar visita'} onClose={onClose}>
      <form className="form" onSubmit={guardar}>
        <Campo label="Cliente *" full><ClienteSelect value={f.clienteId} onChange={set('clienteId')} required /></Campo>
        <Campo label="Fecha y hora"><input type="datetime-local" value={f.fecha} onChange={set('fecha')} required /></Campo>
        <Campo label="Tipo">
          <select value={f.tipo} onChange={set('tipo')}>
            <option value="pileta">🏊 Pileta</option>
            <option value="jardin">🌳 Jardín</option>
            <option value="ambos">🏊🌳 Ambos</option>
          </select>
        </Campo>
        {!f.id && <Campo label="Repetir cada (días) hasta fin de mes"><input type="number" min="0" value={f.repetirDias} onChange={set('repetirDias')} placeholder="Ej: 7" /></Campo>}
        <Campo label="Estado">
          <select value={f.estado} onChange={set('estado')}>
            <option value="programada">Programada</option>
            <option value="hecha">Hecha</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </Campo>
        <Campo label="Tareas" full><textarea rows={2} value={f.tareas} onChange={set('tareas')} placeholder="Aspirar, limpiar skimmer, corte de pasto…" /></Campo>
        <Campo label="Notas" full><input value={f.notas} onChange={set('notas')} /></Campo>
        <div className="form-actions full">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

export function CompletarVisita({ visita, onClose }) {
  const cliente = useLiveQuery(() => db.clientes.get(visita.clienteId), [visita.clienteId]);
  const [f, setF] = useState({ fecha: toLocalInput(new Date()), tareas: visita.tareas || '', ph: '', cloro: '', notas: visita.notas || '', cobro: '', metodo: 'efectivo' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function guardar(e) {
    e.preventDefault();
    const fecha = new Date(f.fecha).toISOString();
    await db.visitas.update(visita.id, { estado: 'hecha', fecha, tareas: f.tareas, ph: f.ph, cloro: f.cloro, notas: f.notas });
    if (Number(f.cobro) > 0) {
      await db.movimientos.add({ tipo: 'ingreso', monto: Number(f.cobro), fecha, categoria: 'Mantenimiento', clienteId: visita.clienteId, metodo: f.metodo, descripcion: 'Cobro en visita' });
    }
    onClose();
  }
  return (
    <Modal titulo={`Completar visita · ${cliente?.nombre || ''}`} onClose={onClose}>
      <form className="form" onSubmit={guardar}>
        <Campo label="Realizada el"><input type="datetime-local" value={f.fecha} onChange={set('fecha')} /></Campo>
        <Campo label="pH medido"><input type="number" step="0.1" value={f.ph} onChange={set('ph')} placeholder="7.2" /></Campo>
        <Campo label="Cloro (ppm)"><input type="number" step="0.1" value={f.cloro} onChange={set('cloro')} placeholder="1.5" /></Campo>
        <Campo label="Tareas realizadas" full><textarea rows={2} value={f.tareas} onChange={set('tareas')} /></Campo>
        <Campo label="Notas" full><input value={f.notas} onChange={set('notas')} /></Campo>
        <Campo label="¿Cobraste algo? ($)"><input type="number" min="0" value={f.cobro} onChange={set('cobro')} /></Campo>
        <Campo label="Método">
          <select value={f.metodo} onChange={set('metodo')}>
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="mercadopago">Mercado Pago</option>
          </select>
        </Campo>
        <div className="form-actions full">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary">✔ Marcar como hecha</button>
        </div>
      </form>
    </Modal>
  );
}

function diaTitulo(d) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((x - hoy) / DIA);
  const nombre = x.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  if (diff === 0) return 'Hoy · ' + nombre;
  if (diff === 1) return 'Mañana · ' + nombre;
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

export default function Visitas() {
  const [form, setForm] = useState(null);
  const [completar, setCompletar] = useState(null);
  const [vista, setVista] = useState('proximas');
  const [cli, setCli] = useState(null);
  const d = useLiveQuery(async () => ({ visitas: await db.visitas.orderBy('fecha').toArray(), clientes: await db.clientes.toArray() }), []);
  if (!d) return null;
  const cMap = new Map(d.clientes.map((c) => [c.id, c]));
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

  let lista = d.visitas.filter((v) => !cli || v.clienteId === cli);
  if (vista === 'proximas') lista = lista.filter((v) => v.estado === 'programada');
  else if (vista === 'hechas') lista = lista.filter((v) => v.estado === 'hecha').reverse();
  else lista = lista.filter((v) => v.estado === 'cancelada').reverse();

  const atrasadas = vista === 'proximas' ? lista.filter((v) => new Date(v.fecha) < hoy) : [];
  const resto = vista === 'proximas' ? lista.filter((v) => new Date(v.fecha) >= hoy) : lista;
  const grupos = [];
  for (const v of resto) {
    const k = new Date(v.fecha).toDateString();
    const g = grupos.find((x) => x.k === k);
    g ? g.items.push(v) : grupos.push({ k, fecha: v.fecha, items: [v] });
  }

  const fila = (v) => {
    const c = cMap.get(v.clienteId);
    return (
      <li key={v.id} className="visita">
        <div className="visita-info" onClick={() => setForm({ ...v, fecha: toLocalInput(v.fecha) })}>
          <b>{c?.nombre || 'Cliente borrado'}</b>
          <small>
            {new Date(v.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · {v.tipo === 'jardin' ? '🌳 Jardín' : v.tipo === 'ambos' ? '🏊🌳 Ambos' : '🏊 Pileta'}
            {v.ph ? ` · pH ${v.ph}` : ''}{v.cloro ? ` · Cl ${v.cloro} ppm` : ''}
          </small>
          {v.tareas && <small className="muted">{v.tareas}</small>}
          {c?.referencias && v.estado === 'programada' && <small className="muted">📌 {c.referencias}</small>}
        </div>
        <div className="fila-acc">
          {v.estado === 'programada' && mapsLink(c) && <a className="btn-icon" href={mapsLink(c)} target="_blank" rel="noreferrer" title="Cómo llegar">📍</a>}
          {v.estado === 'programada' && whatsappLink(c?.telefono) && (
            <a className="btn-icon" title="Avisar por WhatsApp" target="_blank" rel="noreferrer" href={whatsappLink(c.telefono, `Hola ${c.nombre}! Te aviso que paso el ${fmtFechaHora(v.fecha)} para el mantenimiento. Nico Garden & Pool`)}>💬</a>
          )}
          {v.estado === 'programada' && <button className="btn sm primary" onClick={() => setCompletar(v)}>✔ Hecha</button>}
          <button className="btn-icon" onClick={() => confirmar('¿Borrar esta visita?') && db.visitas.delete(v.id)} title="Borrar">🗑️</button>
        </div>
      </li>
    );
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>📅 Agenda de visitas</h1>
        <div className="acciones">
          <button className="btn primary" onClick={() => setForm({})}>＋ Programar</button>
        </div>
      </header>
      <div className="filtros">
        <div className="tabs">
          <button className={vista === 'proximas' ? 'on' : ''} onClick={() => setVista('proximas')}>Pendientes</button>
          <button className={vista === 'hechas' ? 'on' : ''} onClick={() => setVista('hechas')}>Realizadas</button>
          <button className={vista === 'canceladas' ? 'on' : ''} onClick={() => setVista('canceladas')}>Canceladas</button>
        </div>
        <ClienteSelect value={cli} onChange={setCli} vacio="Todos los clientes" />
      </div>

      {atrasadas.length > 0 && (
        <section className="card borde-rojo">
          <h2>⚠️ Atrasadas ({atrasadas.length})</h2>
          <ul className="lista">{atrasadas.map(fila)}</ul>
        </section>
      )}
      {grupos.length === 0 && atrasadas.length === 0 && <Vacio icono="📅">No hay visitas en esta vista.</Vacio>}
      {grupos.map((g) => (
        <section className="card" key={g.k}>
          <h2>{diaTitulo(g.fecha)}</h2>
          <ul className="lista">{g.items.map(fila)}</ul>
        </section>
      ))}
      {form && <VisitaForm inicial={form} onClose={() => setForm(null)} />}
      {completar && <CompletarVisita visita={completar} onClose={() => setCompletar(null)} />}
    </div>
  );
}
