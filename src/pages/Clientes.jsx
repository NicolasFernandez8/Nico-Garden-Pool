import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { ir } from '../nav';
import { Campo, ClienteSelect, Modal, Vacio } from '../components/ui';
import { aCSV, descargar, mapsLink, money, parseCSV, whatsappLink } from '../utils';

const VACIO = { nombre: '', telefono: '', direccion: '', mapsUrl: '', referencias: '', mantenimientosMes: 4, servicio: 'pileta', abono: '', referidoPor: null, activo: true, notas: '', diasVisita: '' };

export function ClienteForm({ inicial, onClose }) {
  const [f, setF] = useState({ ...VACIO, ...inicial });
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e });

  async function guardar(e) {
    e.preventDefault();
    const datos = { ...f, mantenimientosMes: Number(f.mantenimientosMes) || 0, abono: Number(f.abono) || 0 };
    if (datos.id) await db.clientes.put(datos);
    else await db.clientes.add({ ...datos, creado: new Date().toISOString() });
    onClose();
  }
  return (
    <Modal titulo={f.id ? 'Editar cliente' : 'Nuevo cliente'} onClose={onClose}>
      <form className="form" onSubmit={guardar}>
        <Campo label="Nombre y apellido *" full><input value={f.nombre} onChange={set('nombre')} required autoFocus /></Campo>
        <Campo label="Teléfono / WhatsApp"><input type="tel" value={f.telefono} onChange={set('telefono')} placeholder="11 2345 6789" /></Campo>
        <Campo label="Servicio">
          <select value={f.servicio} onChange={set('servicio')}>
            <option value="pileta">🏊 Pileta</option>
            <option value="jardin">🌳 Jardín</option>
            <option value="ambos">🏊🌳 Pileta + Jardín</option>
          </select>
        </Campo>
        <Campo label="Dirección" full><input value={f.direccion} onChange={set('direccion')} placeholder="Calle 123, Localidad" /></Campo>
        <Campo label="Enlace de Google Maps" full><input type="url" value={f.mapsUrl} onChange={set('mapsUrl')} placeholder="https://maps.app.goo.gl/..." /></Campo>
        <Campo label="Referencias (cómo llegar, portón, perro, etc.)" full><textarea rows={2} value={f.referencias} onChange={set('referencias')} /></Campo>
        <Campo label="Mantenimientos por mes"><input type="number" min="0" value={f.mantenimientosMes} onChange={set('mantenimientosMes')} /></Campo>
        <Campo label="Abono mensual ($)"><input type="number" min="0" value={f.abono} onChange={set('abono')} /></Campo>
        <Campo label="Días de visita"><input value={f.diasVisita} onChange={set('diasVisita')} placeholder="Ej: martes y viernes" /></Campo>
        <Campo label="Referido por">
          <ClienteSelect value={f.referidoPor} onChange={set('referidoPor')} vacio="— Nadie —" filtro={(c) => c.id !== f.id} />
        </Campo>
        <Campo label="Notas" full><textarea rows={2} value={f.notas} onChange={set('notas')} /></Campo>
        <label className="check full"><input type="checkbox" checked={f.activo !== false} onChange={set('activo')} /> Cliente activo</label>
        <div className="form-actions full">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

const SERV = { pileta: '🏊 Pileta', jardin: '🌳 Jardín', ambos: '🏊🌳 Ambos' };

export default function Clientes() {
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('activos');
  const [editando, setEditando] = useState(null);
  const clientes = useLiveQuery(() => db.clientes.orderBy('nombre').toArray(), []) || [];
  const cMap = new Map(clientes.map((c) => [c.id, c]));

  const lista = clientes.filter((c) => {
    if (filtro === 'activos' && c.activo === false) return false;
    if (filtro === 'inactivos' && c.activo !== false) return false;
    if (['pileta', 'jardin', 'ambos'].includes(filtro) && c.servicio !== filtro) return false;
    const t = q.toLowerCase();
    return !t || [c.nombre, c.direccion, c.telefono, c.referencias].some((x) => (x || '').toLowerCase().includes(t));
  });

  const columnas = [
    { titulo: 'Nombre', valor: 'nombre' },
    { titulo: 'Teléfono', valor: 'telefono' },
    { titulo: 'Dirección', valor: 'direccion' },
    { titulo: 'Maps', valor: (c) => mapsLink(c) || '' },
    { titulo: 'Referencias', valor: 'referencias' },
    { titulo: 'Servicio', valor: 'servicio' },
    { titulo: 'Mantenimientos/mes', valor: 'mantenimientosMes' },
    { titulo: 'Abono', valor: 'abono' },
    { titulo: 'Días visita', valor: 'diasVisita' },
    { titulo: 'Referido por', valor: (c) => cMap.get(c.referidoPor)?.nombre || '' },
    { titulo: 'Activo', valor: (c) => (c.activo === false ? 'No' : 'Sí') },
    { titulo: 'Notas', valor: 'notas' },
  ];

  async function importar(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const rows = parseCSV(await file.text());
    const [head, ...data] = rows;
    const idx = (n) => head.findIndex((h) => h.trim().toLowerCase().startsWith(n));
    const iN = idx('nombre');
    if (iN < 0) return alert('El archivo necesita al menos una columna "Nombre".');
    const g = (r, n) => (idx(n) >= 0 ? r[idx(n)]?.trim() : '');
    const nuevos = data.filter((r) => r[iN]?.trim()).map((r) => ({
      ...VACIO,
      nombre: r[iN].trim(),
      telefono: g(r, 'tel'),
      direccion: g(r, 'dir'),
      mapsUrl: g(r, 'maps'),
      referencias: g(r, 'refer'),
      servicio: ['pileta', 'jardin', 'ambos'].includes(g(r, 'serv')) ? g(r, 'serv') : 'pileta',
      mantenimientosMes: Number(g(r, 'mant')) || 0,
      abono: Number(g(r, 'abono')) || 0,
      diasVisita: g(r, 'días') || g(r, 'dias'),
      notas: g(r, 'notas'),
      activo: g(r, 'activo').toLowerCase() !== 'no',
      creado: new Date().toISOString(),
    }));
    await db.clientes.bulkAdd(nuevos);
    alert(`Se importaron ${nuevos.length} clientes.`);
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>👥 Clientes</h1>
        <div className="acciones">
          <button className="btn" onClick={() => descargar('clientes.csv', aCSV(lista, columnas), 'text/csv')}>⬇️ Planilla</button>
          <label className="btn">⬆️ Importar<input type="file" accept=".csv,text/csv" hidden onChange={importar} /></label>
          <button className="btn primary" onClick={() => setEditando({})}>＋ Nuevo</button>
        </div>
      </header>

      <div className="filtros">
        <input className="buscar" placeholder="🔍 Buscar por nombre, dirección, teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="activos">Activos</option>
          <option value="todos">Todos</option>
          <option value="inactivos">Inactivos</option>
          <option value="pileta">Solo pileta</option>
          <option value="jardin">Solo jardín</option>
          <option value="ambos">Pileta + jardín</option>
        </select>
      </div>

      {lista.length === 0 ? (
        <Vacio icono="👥">{clientes.length ? 'No hay resultados.' : 'Todavía no cargaste clientes. Tocá “＋ Nuevo”.'}</Vacio>
      ) : (
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th><th>Dirección</th><th>Referencias</th><th>Servicio</th><th className="num">Mant./mes</th><th className="num">Abono</th><th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className={c.activo === false ? 'inactivo' : ''}>
                  <td data-l="Nombre"><a href={'#/cliente/' + c.id}><b>{c.nombre}</b></a>{c.telefono && <div className="muted sm">{c.telefono}</div>}</td>
                  <td data-l="Dirección">{c.direccion || '—'}</td>
                  <td data-l="Referencias" className="sm">{c.referencias || '—'}</td>
                  <td data-l="Servicio">{SERV[c.servicio]}</td>
                  <td data-l="Mant./mes" className="num">{c.mantenimientosMes}</td>
                  <td data-l="Abono" className="num">{money(c.abono)}</td>
                  <td className="fila-acc">
                    {mapsLink(c) && <a className="btn-icon" href={mapsLink(c)} target="_blank" rel="noreferrer" title="Abrir en Maps">📍</a>}
                    {whatsappLink(c.telefono) && <a className="btn-icon" href={whatsappLink(c.telefono)} target="_blank" rel="noreferrer" title="WhatsApp">💬</a>}
                    <button className="btn-icon" onClick={() => setEditando(c)} title="Editar">✏️</button>
                    <button className="btn-icon" onClick={() => ir('cliente', c.id)} title="Ver ficha">➡️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editando && <ClienteForm inicial={editando} onClose={() => setEditando(null)} />}
    </div>
  );
}
