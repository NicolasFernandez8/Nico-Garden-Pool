import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, estadoProductos, getAjuste } from '../db';
import { Campo, ClienteSelect, Countdown, Modal, Vacio, confirmar } from '../components/ui';
import { DIA, cancelarNotificacionNativa, fmtFechaHora, nivelVencimiento, programarNotificacionNativa, toLocalInput } from '../utils';

export async function programarAvisos(ap) {
  const [c, p, horas] = await Promise.all([db.clientes.get(ap.clienteId), db.productos.get(ap.productoId), getAjuste('avisoHorasAntes', 24)]);
  const nombre = `${p?.icono || ''} ${p?.nombre || ''}`.trim();
  const t = new Date(ap.proxima).getTime();
  await programarNotificacionNativa(ap.id * 10 + 1, `⏰ Pronto: ${nombre}`, `${c?.nombre} — faltan ${horas} h para reponer.`, new Date(t - Number(horas) * 3600000));
  await programarNotificacionNativa(ap.id * 10 + 2, `⚠️ Vencido: ${nombre}`, `${c?.nombre} — hay que volver a colocarlo.`, new Date(t));
}
export async function cancelarAvisos(apId) {
  await cancelarNotificacionNativa(apId * 10 + 1);
  await cancelarNotificacionNativa(apId * 10 + 2);
}

export function AplicacionForm({ inicial = {}, onClose }) {
  const productos = useLiveQuery(() => db.productos.toArray(), []) || [];
  const insumos = useLiveQuery(() => db.insumos.toArray(), []) || [];
  const [f, setF] = useState({ clienteId: null, productoId: '', fecha: toLocalInput(), cantidad: '', intervaloDias: '', notas: '', insumoId: '', ...inicial });
  const prod = productos.find((p) => p.id === Number(f.productoId));
  const intervalo = f.intervaloDias !== '' ? Number(f.intervaloDias) : prod?.intervaloDias || 7;
  const proxima = new Date(new Date(f.fecha).getTime() + intervalo * DIA);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });

  async function guardar(e) {
    e.preventDefault();
    if (!f.clienteId || !f.productoId) return;
    const clienteId = Number(f.clienteId), productoId = Number(f.productoId);
    // cancelar avisos de la aplicación anterior del mismo producto
    const previas = await db.aplicaciones.where('clienteId').equals(clienteId).filter((a) => a.productoId === productoId).toArray();
    for (const a of previas) await cancelarAvisos(a.id);
    const ap = {
      clienteId, productoId,
      fecha: new Date(f.fecha).toISOString(),
      cantidad: f.cantidad,
      intervaloDias: intervalo,
      proxima: proxima.toISOString(),
      notas: f.notas,
    };
    ap.id = await db.aplicaciones.add(ap);
    if (f.insumoId && Number(f.cantidad) > 0) {
      const ins = await db.insumos.get(Number(f.insumoId));
      if (ins) await db.insumos.update(ins.id, { stock: Math.max(0, Number(ins.stock) - Number(f.cantidad)) });
    }
    await programarAvisos(ap);
    onClose();
  }

  return (
    <Modal titulo="Registrar producto colocado" onClose={onClose}>
      <form className="form" onSubmit={guardar}>
        <Campo label="Cliente *" full><ClienteSelect value={f.clienteId} onChange={set('clienteId')} required filtro={(c) => c.servicio !== 'jardin'} /></Campo>
        <Campo label="Producto *">
          <select value={f.productoId} onChange={set('productoId')} required>
            <option value="">Elegí</option>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.icono} {p.nombre}</option>)}
          </select>
        </Campo>
        <Campo label="¿Cuándo se colocó?"><input type="datetime-local" value={f.fecha} onChange={set('fecha')} required /></Campo>
        <Campo label="Cantidad"><input type="number" step="any" min="0" value={f.cantidad} onChange={set('cantidad')} placeholder={prod?.unidad || ''} /></Campo>
        <Campo label={`Reponer cada (días)`}><input type="number" min="0" step="any" value={f.intervaloDias} onChange={set('intervaloDias')} placeholder={String(prod?.intervaloDias ?? 7)} /></Campo>
        <Campo label="Descontar del stock de" full>
          <select value={f.insumoId} onChange={set('insumoId')}>
            <option value="">— No descontar —</option>
            {insumos.map((i) => <option key={i.id} value={i.id}>{i.nombre} ({i.stock} {i.unidad})</option>)}
          </select>
        </Campo>
        <Campo label="Notas" full><input value={f.notas} onChange={set('notas')} /></Campo>
        <div className="info full">📆 Próxima reposición: <b>{fmtFechaHora(proxima)}</b></div>
        <div className="form-actions full">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function CatalogoProductos({ onClose }) {
  const productos = useLiveQuery(() => db.productos.toArray(), []) || [];
  const [n, setN] = useState({ nombre: '', intervaloDias: 7, unidad: '', icono: '🧪' });
  return (
    <Modal titulo="Catálogo de productos" onClose={onClose}>
      <div className="tabla-wrap fija"><table className="tabla compacta">
        <thead><tr><th>Ícono</th><th>Producto</th><th>Cada (días)</th><th>Unidad</th><th></th></tr></thead>
        <tbody>
          {productos.map((p) => (
            <tr key={p.id}>
              <td><input className="mini" value={p.icono} onChange={(e) => db.productos.update(p.id, { icono: e.target.value })} /></td>
              <td><input value={p.nombre} onChange={(e) => db.productos.update(p.id, { nombre: e.target.value })} /></td>
              <td><input className="mini" type="number" value={p.intervaloDias} onChange={(e) => db.productos.update(p.id, { intervaloDias: Number(e.target.value) })} /></td>
              <td><input className="mini" value={p.unidad} onChange={(e) => db.productos.update(p.id, { unidad: e.target.value })} /></td>
              <td><button className="btn-icon" onClick={async () => {
                if ((await db.aplicaciones.where('productoId').equals(p.id).count()) > 0) return alert('Este producto tiene registros; no se puede borrar.');
                if (confirmar(`¿Borrar ${p.nombre}?`)) db.productos.delete(p.id);
              }}>🗑️</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <form className="form-inline" onSubmit={(e) => { e.preventDefault(); if (n.nombre) { db.productos.add({ ...n, intervaloDias: Number(n.intervaloDias) }); setN({ nombre: '', intervaloDias: 7, unidad: '', icono: '🧪' }); } }}>
        <input className="mini" value={n.icono} onChange={(e) => setN({ ...n, icono: e.target.value })} />
        <input placeholder="Nuevo producto" value={n.nombre} onChange={(e) => setN({ ...n, nombre: e.target.value })} />
        <input className="mini" type="number" value={n.intervaloDias} onChange={(e) => setN({ ...n, intervaloDias: e.target.value })} title="Días" />
        <input className="mini" placeholder="Unidad" value={n.unidad} onChange={(e) => setN({ ...n, unidad: e.target.value })} />
        <button className="btn primary">＋</button>
      </form>
    </Modal>
  );
}

export default function Piletas() {
  const [form, setForm] = useState(null);
  const [catalogo, setCatalogo] = useState(false);
  const [vista, setVista] = useState('estado');
  const [filtroCli, setFiltroCli] = useState(null);
  const d = useLiveQuery(async () => ({
    estados: await estadoProductos(),
    historial: await db.aplicaciones.orderBy('fecha').reverse().limit(300).toArray(),
    clientes: await db.clientes.toArray(),
    productos: await db.productos.toArray(),
    horas: Number(await getAjuste('avisoHorasAntes', 24)),
  }), []);
  if (!d) return null;
  const cMap = new Map(d.clientes.map((c) => [c.id, c]));
  const pMap = new Map(d.productos.map((p) => [p.id, p]));
  const estados = d.estados
    .filter((a) => cMap.get(a.clienteId)?.activo !== false)
    .filter((a) => !filtroCli || a.clienteId === filtroCli)
    .sort((a, b) => (a.desactivado ? 1 : 0) - (b.desactivado ? 1 : 0) || new Date(a.proxima) - new Date(b.proxima));
  const historial = d.historial.filter((a) => !filtroCli || a.clienteId === filtroCli);

  const cont = { vencido: 0, pronto: 0, ok: 0 };
  estados.forEach((a) => !a.desactivado && cont[nivelVencimiento(a.proxima, d.horas)]++);

  return (
    <div className="page">
      <header className="page-head">
        <h1>🧪 Productos en piletas</h1>
        <div className="acciones">
          <button className="btn" onClick={() => setCatalogo(true)}>📋 Catálogo</button>
          <button className="btn primary" onClick={() => setForm({})}>＋ Registrar</button>
        </div>
      </header>

      <div className="chips">
        <span className="chip rojo">⚠️ Vencidos: {cont.vencido}</span>
        <span className="chip amarillo">⏰ Por vencer: {cont.pronto}</span>
        <span className="chip verde">✅ Al día: {cont.ok}</span>
      </div>

      <div className="filtros">
        <div className="tabs">
          <button className={vista === 'estado' ? 'on' : ''} onClick={() => setVista('estado')}>Estado actual</button>
          <button className={vista === 'historial' ? 'on' : ''} onClick={() => setVista('historial')}>Historial</button>
        </div>
        <ClienteSelect value={filtroCli} onChange={setFiltroCli} vacio="Todos los clientes" />
      </div>

      {vista === 'estado' ? (
        estados.length === 0 ? (
          <Vacio icono="🏊">Registrá la primera boya o cloro que colocaste.</Vacio>
        ) : (
          <div className="cards-grid">
            {estados.map((a) => {
              const p = pMap.get(a.productoId);
              const nivel = a.desactivado ? 'off' : nivelVencimiento(a.proxima, d.horas);
              const total = a.intervaloDias * DIA;
              const pasado = Date.now() - new Date(a.fecha).getTime();
              return (
                <div key={a.id} className={'prod-card ' + nivel}>
                  <div className="prod-top">
                    <span className="prod-ico">{p?.icono}</span>
                    <div>
                      <b>{p?.nombre}</b>
                      <a href={'#/cliente/' + a.clienteId} className="sm">{cMap.get(a.clienteId)?.nombre}</a>
                    </div>
                  </div>
                  {a.desactivado ? <span className="countdown off">Seguimiento pausado</span> : <Countdown fecha={a.proxima} horasAviso={d.horas} />}
                  {!a.desactivado && <div className="barra"><div className={'barra-in ' + nivel} style={{ width: Math.min(100, (pasado / total) * 100) + '%' }} /></div>}
                  <div className="sm muted">Colocado: {fmtFechaHora(a.fecha)}{a.cantidad ? ` · ${a.cantidad} ${p?.unidad || ''}` : ''}</div>
                  <div className="sm muted">Reponer: {fmtFechaHora(a.proxima)} (cada {a.intervaloDias} d)</div>
                  <div className="prod-acc">
                    <button className="btn sm primary" onClick={() => setForm({ clienteId: a.clienteId, productoId: a.productoId, intervaloDias: a.intervaloDias, cantidad: a.cantidad })}>✔ Repuesto hoy</button>
                    <button className="btn sm ghost" onClick={async () => {
                      await db.aplicaciones.update(a.id, { desactivado: !a.desactivado });
                      if (!a.desactivado) await cancelarAvisos(a.id); else await programarAvisos(a);
                    }}>{a.desactivado ? '▶ Reanudar' : '⏸ Pausar'}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : historial.length === 0 ? (
        <Vacio>Sin registros.</Vacio>
      ) : (
        <div className="tabla-wrap">
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Cantidad</th><th>Próxima</th><th>Notas</th><th></th></tr></thead>
            <tbody>
              {historial.map((a) => (
                <tr key={a.id}>
                  <td data-l="Fecha">{fmtFechaHora(a.fecha)}</td>
                  <td data-l="Cliente"><a href={'#/cliente/' + a.clienteId}>{cMap.get(a.clienteId)?.nombre}</a></td>
                  <td data-l="Producto">{pMap.get(a.productoId)?.icono} {pMap.get(a.productoId)?.nombre}</td>
                  <td data-l="Cantidad">{a.cantidad ? `${a.cantidad} ${pMap.get(a.productoId)?.unidad || ''}` : '—'}</td>
                  <td data-l="Próxima">{fmtFechaHora(a.proxima)}</td>
                  <td data-l="Notas" className="sm">{a.notas || '—'}</td>
                  <td className="fila-acc"><button className="btn-icon" onClick={async () => { if (confirmar('¿Borrar este registro?')) { await cancelarAvisos(a.id); await db.aplicaciones.delete(a.id); } }}>🗑️</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && <AplicacionForm inicial={form} onClose={() => setForm(null)} />}
      {catalogo && <CatalogoProductos onClose={() => setCatalogo(false)} />}
      <p className="muted sm nota">Clientes de solo jardín no aparecen en este listado. Las alertas usan la anticipación configurada en Ajustes ({d.horas} h).</p>
    </div>
  );
}
