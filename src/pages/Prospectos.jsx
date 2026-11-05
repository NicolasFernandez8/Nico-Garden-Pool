import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { ir } from '../nav';
import { Campo, Modal, Stat, Vacio, confirmar } from '../components/ui';
import { aCSV, descargar, fmtFecha, whatsappLink } from '../utils';

export const ETAPAS = { nuevo: '🆕 Nuevo', contactado: '📞 Contactado', presupuestado: '📝 Presupuestado', ganado: '🏆 Ganado', perdido: '❌ Perdido' };

export const RUBROS = {
  hoteleria: { nombre: 'Hotelería', filtro: '["tourism"~"^(hotel|hostel|guest_house|motel|apartment|chalet)$"]' },
  camping: { nombre: 'Campings', filtro: '["tourism"~"^(camp_site|caravan_site)$"]' },
  clubes: { nombre: 'Clubes y piscinas', filtro: '["leisure"~"^(sports_centre|water_park|swimming_pool)$"]["name"]' },
  restaurantes: { nombre: 'Restaurantes y bares', filtro: '["amenity"~"^(restaurant|bar|cafe)$"]["name"]' },
  gimnasios: { nombre: 'Gimnasios', filtro: '["leisure"="fitness_centre"]["name"]' },
};
const TIPO = { hotel: 'Hotel', hostel: 'Hostel', guest_house: 'Casa de huéspedes', motel: 'Motel', apartment: 'Apartamentos', chalet: 'Chalet', camp_site: 'Camping', caravan_site: 'Área caravanas', sports_centre: 'Centro deportivo', water_park: 'Parque acuático', swimming_pool: 'Piscina', restaurant: 'Restaurante', bar: 'Bar', cafe: 'Café', fitness_centre: 'Gimnasio' };

const SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

/** Consulta OpenStreetMap (API Overpass, gratuita y oficial) recorriendo cada localidad de la zona */
export async function mapearZona({ zona, nivelZona, rubro, limite }, onProgreso) {
  const q = `[out:json][timeout:240];
area["boundary"="administrative"]["admin_level"="${nivelZona}"]["name"~"${zona.replace(/"/g, '')}",i]->.zona;
rel(area.zona)["boundary"="administrative"]["admin_level"="8"];
map_to_area->.locs;
foreach.locs->.l(
  .l out tags;
  nwr(area.l)${RUBROS[rubro].filtro};
  out center tags;
);`;
  let json, err;
  for (const s of SERVIDORES) {
    try {
      onProgreso?.(`Consultando ${new URL(s).host}… (puede tardar 1-3 min)`);
      const r = await fetch(s, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      json = await r.json();
      break;
    } catch (e) { err = e; }
  }
  if (!json) throw new Error('No se pudo consultar OpenStreetMap: ' + (err?.message || ''));
  const out = [];
  const vistos = new Set();
  let localidad = '';
  let nLocs = 0;
  for (const el of json.elements) {
    if (el.type === 'area') { localidad = el.tags?.name || ''; nLocs++; continue; }
    const t = el.tags || {};
    const id = `${el.type}/${el.id}`;
    if (!t.name || vistos.has(id)) continue;
    vistos.add(id);
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    const calle = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
    const loc = t['addr:city'] || localidad;
    out.push({
      osmId: id,
      nombre: t.name,
      rubro: RUBROS[rubro].nombre,
      tipo: TIPO[t.tourism || t.leisure || t.amenity] || '',
      estrellas: t.stars || '',
      localidad: loc,
      direccion: [calle, t['addr:postcode'], loc].filter(Boolean).join(', '),
      telefono: t.phone || t['contact:phone'] || t['contact:mobile'] || '',
      email: t.email || t['contact:email'] || '',
      web: t.website || t['contact:website'] || t.url || '',
      habitaciones: t.rooms || t.beds || '',
      piscina: t.swimming_pool === 'yes' || /pool|piscina/i.test(t.amenity || '') ? 'Sí' : '',
      lat, lon,
      mapsUrl: lat ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` : '',
    });
  }
  // priorizar los que tienen más datos de contacto
  const puntaje = (p) => (p.telefono ? 2 : 0) + (p.email ? 2 : 0) + (p.web ? 1 : 0) + (p.direccion ? 1 : 0);
  out.sort((a, b) => puntaje(b) - puntaje(a) || a.localidad.localeCompare(b.localidad));
  return { resultados: out.slice(0, limite), total: out.length, localidades: nLocs };
}

function Mapeador({ onClose }) {
  const [f, setF] = useState({ zona: 'Alicante|Alacant', nivelZona: 6, rubro: 'hoteleria', limite: 500 });
  const [estado, setEstado] = useState('');
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function buscar(e) {
    e.preventDefault();
    setError(''); setRes(null);
    try {
      const r = await mapearZona({ ...f, limite: Number(f.limite) || 500 }, setEstado);
      setRes(r); setEstado('');
    } catch (er) { setError(er.message); setEstado(''); }
  }
  async function guardar() {
    const existentes = new Set((await db.prospectos.toArray()).map((p) => p.osmId).filter(Boolean));
    const nuevos = res.resultados.filter((p) => !existentes.has(p.osmId)).map((p) => ({ ...p, estado: 'nuevo', fecha: new Date().toISOString(), fuente: 'OpenStreetMap', referidoPor: null, notas: '' }));
    await db.prospectos.bulkAdd(nuevos);
    alert(`Se guardaron ${nuevos.length} prospectos${res.resultados.length - nuevos.length ? ` (${res.resultados.length - nuevos.length} ya estaban)` : ''}.`);
    onClose();
  }
  const porLoc = res ? Object.entries(res.resultados.reduce((m, p) => ((m[p.localidad || 'Sin localidad'] = (m[p.localidad || 'Sin localidad'] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]) : [];

  return (
    <Modal titulo="Mapear prospectos por zona" onClose={onClose} ancho="760px">
      <form className="form" onSubmit={buscar}>
        <Campo label="Rubro">
          <select value={f.rubro} onChange={set('rubro')}>{Object.entries(RUBROS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}</select>
        </Campo>
        <Campo label="Cantidad máxima"><input type="number" min="1" max="5000" value={f.limite} onChange={set('limite')} /></Campo>
        <Campo label="Zona (nombre oficial; podés usar | para variantes)"><input value={f.zona} onChange={set('zona')} required /></Campo>
        <Campo label="Tipo de zona">
          <select value={f.nivelZona} onChange={set('nivelZona')}>
            <option value={4}>Comunidad / estado / provincia AR</option>
            <option value={6}>Provincia (España) / partido (AR)</option>
            <option value={7}>Comarca / departamento</option>
          </select>
        </Campo>
        <div className="form-actions full">
          <button className="btn primary" disabled={!!estado}>{estado ? 'Buscando…' : '🔎 Buscar localidad por localidad'}</button>
        </div>
      </form>
      {estado && <p className="info">{estado}</p>}
      {error && <p className="info rojo">{error}</p>}
      {res && (
        <>
          <p className="info">Se encontraron <b>{res.total}</b> en <b>{res.localidades}</b> localidades. Se van a guardar <b>{res.resultados.length}</b> (primero los que tienen más datos de contacto).</p>
          <div className="chips" style={{ margin: '10px 0' }}>{porLoc.slice(0, 40).map(([l, n]) => <span key={l} className="chip">{l}: {n}</span>)}</div>
          <div className="form-actions"><button className="btn primary" onClick={guardar}>💾 Guardar {res.resultados.length} prospectos</button></div>
        </>
      )}
      <p className="muted sm">Datos públicos de © colaboradores de OpenStreetMap (ODbL), consultados desde tu dispositivo. Antes de contactar, revisá que cumplas las normas de comunicaciones comerciales del país (en España: RGPD y LSSI).</p>
    </Modal>
  );
}

function ProspectoForm({ inicial, onClose }) {
  const [f, setF] = useState({ nombre: '', telefono: '', email: '', web: '', direccion: '', localidad: '', rubro: '', estado: 'nuevo', notas: '', ...inicial });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function guardar(e) {
    e.preventDefault();
    f.id ? await db.prospectos.put(f) : await db.prospectos.add({ ...f, fecha: new Date().toISOString() });
    onClose();
  }
  return (
    <Modal titulo={f.id ? 'Editar prospecto' : 'Nuevo prospecto'} onClose={onClose}>
      <form className="form" onSubmit={guardar}>
        <Campo label="Nombre *" full><input value={f.nombre} onChange={set('nombre')} required /></Campo>
        <Campo label="Rubro"><input value={f.rubro} onChange={set('rubro')} /></Campo>
        <Campo label="Localidad"><input value={f.localidad} onChange={set('localidad')} /></Campo>
        <Campo label="Teléfono"><input value={f.telefono} onChange={set('telefono')} /></Campo>
        <Campo label="Email"><input type="email" value={f.email} onChange={set('email')} /></Campo>
        <Campo label="Web" full><input value={f.web} onChange={set('web')} /></Campo>
        <Campo label="Dirección" full><input value={f.direccion} onChange={set('direccion')} /></Campo>
        <Campo label="Etapa"><select value={f.estado} onChange={set('estado')}>{Object.entries(ETAPAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <Campo label="Notas" full><textarea rows={2} value={f.notas} onChange={set('notas')} /></Campo>
        <div className="form-actions full">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

const POR_PAGINA = 50;

export default function Prospectos() {
  const [mapear, setMapear] = useState(false);
  const [form, setForm] = useState(null);
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('');
  const [rubro, setRubro] = useState('');
  const [etapa, setEtapa] = useState('');
  const [pag, setPag] = useState(0);
  const todos = useLiveQuery(() => db.prospectos.toArray(), []) || [];
  const localidades = [...new Set(todos.map((p) => p.localidad).filter(Boolean))].sort();
  const rubros = [...new Set(todos.map((p) => p.rubro).filter(Boolean))].sort();
  const t = q.toLowerCase();
  const lista = todos
    .filter((p) => (!loc || p.localidad === loc) && (!rubro || p.rubro === rubro) && (!etapa || p.estado === etapa))
    .filter((p) => !t || [p.nombre, p.direccion, p.telefono, p.email, p.localidad].some((x) => (x || '').toLowerCase().includes(t)))
    .sort((a, b) => (a.localidad || '').localeCompare(b.localidad || '') || a.nombre.localeCompare(b.nombre));
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const pagina = lista.slice(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA);

  const exportar = () => descargar('prospectos.csv', aCSV(lista, [
    { titulo: 'Nombre', valor: 'nombre' }, { titulo: 'Rubro', valor: 'rubro' }, { titulo: 'Tipo', valor: 'tipo' }, { titulo: 'Estrellas', valor: 'estrellas' },
    { titulo: 'Localidad', valor: 'localidad' }, { titulo: 'Dirección', valor: 'direccion' }, { titulo: 'Teléfono', valor: 'telefono' },
    { titulo: 'Email', valor: 'email' }, { titulo: 'Web', valor: 'web' }, { titulo: 'Habitaciones', valor: 'habitaciones' },
    { titulo: 'Maps', valor: 'mapsUrl' }, { titulo: 'Etapa', valor: (p) => ETAPAS[p.estado] }, { titulo: 'Notas', valor: 'notas' }, { titulo: 'Fuente', valor: 'fuente' },
  ]), 'text/csv');

  async function convertir(p) {
    const id = await db.clientes.add({ nombre: p.nombre, telefono: p.telefono, direccion: p.direccion, mapsUrl: p.mapsUrl || '', referencias: '', mantenimientosMes: 4, servicio: 'pileta', abono: 0, referidoPor: p.referidoPor || null, activo: true, notas: [p.email, p.web, p.notas].filter(Boolean).join(' · '), creado: new Date().toISOString() });
    await db.prospectos.update(p.id, { estado: 'ganado', clienteId: id });
    ir('cliente', id);
  }
  async function borrarFiltrados() {
    if (!confirmar(`¿Borrar los ${lista.length} prospectos filtrados?`)) return;
    await db.prospectos.bulkDelete(lista.map((p) => p.id));
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>🎯 Prospectos</h1>
        <div className="acciones">
          <button className="btn" onClick={exportar} disabled={!lista.length}>⬇️ Planilla</button>
          <button className="btn" onClick={() => setForm({})}>＋ Manual</button>
          <button className="btn primary" onClick={() => setMapear(true)}>🗺️ Mapear zona</button>
        </div>
      </header>
      <div className="stats">
        <Stat titulo="Prospectos" valor={todos.length} sub={`${localidades.length} localidades`} />
        <Stat titulo="Con teléfono" valor={todos.filter((p) => p.telefono).length} />
        <Stat titulo="Con email" valor={todos.filter((p) => p.email).length} />
        <Stat titulo="Ganados" valor={todos.filter((p) => p.estado === 'ganado').length} tono="verde" />
      </div>
      <div className="filtros">
        <input className="buscar" placeholder="🔍 Buscar nombre, teléfono, email…" value={q} onChange={(e) => { setQ(e.target.value); setPag(0); }} />
        <select value={loc} onChange={(e) => { setLoc(e.target.value); setPag(0); }}><option value="">Todas las localidades</option>{localidades.map((l) => <option key={l}>{l}</option>)}</select>
        <select value={rubro} onChange={(e) => { setRubro(e.target.value); setPag(0); }}><option value="">Todos los rubros</option>{rubros.map((l) => <option key={l}>{l}</option>)}</select>
        <select value={etapa} onChange={(e) => { setEtapa(e.target.value); setPag(0); }}><option value="">Todas las etapas</option>{Object.entries(ETAPAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      {lista.length === 0 ? (
        <Vacio icono="🎯">{todos.length ? 'No hay resultados con esos filtros.' : 'Tocá “🗺️ Mapear zona” para buscar negocios por rubro, localidad por localidad.'}</Vacio>
      ) : (
        <>
          <div className="tabla-wrap">
            <table className="tabla">
              <thead><tr><th>Nombre</th><th>Localidad</th><th>Contacto</th><th>Etapa</th><th></th></tr></thead>
              <tbody>
                {pagina.map((p) => (
                  <tr key={p.id}>
                    <td data-l="Nombre"><b className="clic" onClick={() => setForm(p)}>{p.nombre}</b><div className="muted sm">{[p.tipo || p.rubro, p.estrellas && '★'.repeat(Math.min(5, parseInt(p.estrellas) || 0))].filter(Boolean).join(' · ')}</div></td>
                    <td data-l="Localidad">{p.localidad || '—'}<div className="muted sm">{p.direccion !== p.localidad ? p.direccion : ''}</div></td>
                    <td data-l="Contacto" className="sm">
                      {p.telefono && <div>📞 <a href={'tel:' + p.telefono}>{p.telefono}</a></div>}
                      {p.email && <div>✉️ <a href={'mailto:' + p.email}>{p.email}</a></div>}
                      {p.web && <div>🌐 <a href={/^https?:/.test(p.web) ? p.web : 'https://' + p.web} target="_blank" rel="noreferrer">{p.web.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a></div>}
                      {!p.telefono && !p.email && !p.web && <span className="muted">Sin datos de contacto</span>}
                    </td>
                    <td data-l="Etapa"><select value={p.estado} onChange={(e) => db.prospectos.update(p.id, { estado: e.target.value })}>{Object.entries(ETAPAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                    <td className="fila-acc">
                      {p.mapsUrl && <a className="btn-icon" href={p.mapsUrl} target="_blank" rel="noreferrer" title="Maps">📍</a>}
                      {whatsappLink(p.telefono) && <a className="btn-icon" href={whatsappLink(p.telefono)} target="_blank" rel="noreferrer" title="WhatsApp">💬</a>}
                      {p.estado !== 'ganado' && <button className="btn-icon" title="Pasar a cliente" onClick={() => convertir(p)}>➡️</button>}
                      <button className="btn-icon" onClick={() => confirmar('¿Borrar prospecto?') && db.prospectos.delete(p.id)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="paginador">
            <button className="btn sm" disabled={pag === 0} onClick={() => setPag(pag - 1)}>← Anterior</button>
            <span className="muted sm">Página {pag + 1} de {paginas} · {lista.length} prospectos</span>
            <button className="btn sm" disabled={pag >= paginas - 1} onClick={() => setPag(pag + 1)}>Siguiente →</button>
          </div>
          <div className="zona-peligro"><button className="btn ghost rojo sm" onClick={borrarFiltrados}>🗑️ Borrar los {lista.length} filtrados</button></div>
        </>
      )}
      <p className="muted sm nota">Fecha de alta del último: {todos.length ? fmtFecha(todos.reduce((m, p) => (p.fecha > m ? p.fecha : m), '')) : '—'}</p>
      {mapear && <Mapeador onClose={() => setMapear(false)} />}
      {form && <ProspectoForm inicial={form} onClose={() => setForm(null)} />}
    </div>
  );
}
