import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Campo, ClienteSelect, Modal, Vacio, confirmar } from '../components/ui';
import { comprimirImagen, descargar, fmtFecha, toDateInput } from '../utils';

function useURL(blob) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return url;
}

function Img({ blob, ...p }) {
  const url = useURL(blob);
  return url ? <img src={url} alt="" loading="lazy" {...p} /> : null;
}

function Subir({ clienteId, onClose }) {
  const [f, setF] = useState({ clienteId: clienteId || null, tipo: 'pileta', etapa: 'antes', fecha: toDateInput(), nota: '' });
  const [archivos, setArchivos] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  async function guardar(e) {
    e.preventDefault();
    if (!f.clienteId || !archivos.length) return;
    setSubiendo(true);
    for (const a of archivos) {
      const [blob, thumb] = await Promise.all([comprimirImagen(a, 1600, 0.82), comprimirImagen(a, 420, 0.7)]);
      await db.fotos.add({ clienteId: Number(f.clienteId), tipo: f.tipo, etapa: f.etapa, fecha: new Date(f.fecha + 'T12:00').toISOString(), nota: f.nota, blob, thumb });
    }
    onClose();
  }
  return (
    <Modal titulo="Subir fotos" onClose={onClose}>
      <form className="form" onSubmit={guardar}>
        <Campo label="Cliente *" full><ClienteSelect value={f.clienteId} onChange={set('clienteId')} required /></Campo>
        <Campo label="Tipo">
          <select value={f.tipo} onChange={set('tipo')}>
            <option value="pileta">🏊 Pileta</option>
            <option value="jardin">🌳 Jardín</option>
          </select>
        </Campo>
        <Campo label="Etapa">
          <select value={f.etapa} onChange={set('etapa')}>
            <option value="antes">Antes</option>
            <option value="despues">Después</option>
            <option value="otra">Otra / seguimiento</option>
          </select>
        </Campo>
        <Campo label="Fecha"><input type="date" value={f.fecha} onChange={set('fecha')} /></Campo>
        <Campo label="Nota"><input value={f.nota} onChange={set('nota')} /></Campo>
        <div className="full subir-btns">
          <label className="btn">📷 Sacar foto<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setArchivos([...archivos, ...e.target.files])} /></label>
          <label className="btn">🖼️ Elegir de la galería<input type="file" accept="image/*" multiple hidden onChange={(e) => setArchivos([...archivos, ...e.target.files])} /></label>
          <span className="muted">{archivos.length} foto(s) seleccionada(s)</span>
        </div>
        <div className="form-actions full">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={subiendo || !archivos.length}>{subiendo ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}

function Comparador({ antes, despues }) {
  const [x, setX] = useState(50);
  const ua = useURL(antes.blob), ud = useURL(despues.blob);
  return (
    <div className="comparador">
      <img src={ud} alt="después" />
      <div className="comp-antes" style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }}><img src={ua} alt="antes" /></div>
      <div className="comp-linea" style={{ left: x + '%' }} />
      <span className="comp-tag izq">Antes · {fmtFecha(antes.fecha)}</span>
      <span className="comp-tag der">Después · {fmtFecha(despues.fecha)}</span>
      <input type="range" min="0" max="100" value={x} onChange={(e) => setX(Number(e.target.value))} aria-label="Comparar" />
    </div>
  );
}

function Visor({ foto, onClose, cliente }) {
  const url = useURL(foto.blob);
  return (
    <Modal titulo={`${cliente?.nombre || ''} · ${foto.etapa} · ${fmtFecha(foto.fecha)}`} onClose={onClose} ancho="900px">
      <img src={url} alt="" className="visor-img" />
      {foto.nota && <p>{foto.nota}</p>}
      <div className="form-actions">
        <button className="btn" onClick={() => descargar(`${cliente?.nombre || 'foto'}-${foto.etapa}-${foto.id}.jpg`, foto.blob)}>⬇️ Descargar</button>
        <select value={foto.etapa} onChange={(e) => db.fotos.update(foto.id, { etapa: e.target.value })}>
          <option value="antes">Antes</option><option value="despues">Después</option><option value="otra">Otra</option>
        </select>
        <button className="btn ghost rojo" onClick={async () => { if (confirmar('¿Borrar esta foto?')) { await db.fotos.delete(foto.id); onClose(); } }}>🗑️ Borrar</button>
      </div>
    </Modal>
  );
}

export default function Galeria({ clienteId }) {
  const [cli, setCli] = useState(clienteId || null);
  const [tipo, setTipo] = useState('');
  const [etapa, setEtapa] = useState('');
  const [subir, setSubir] = useState(false);
  const [ver, setVer] = useState(null);
  const d = useLiveQuery(async () => ({ fotos: await db.fotos.orderBy('fecha').reverse().toArray(), clientes: await db.clientes.toArray() }), []);
  if (!d) return null;
  const cMap = new Map(d.clientes.map((c) => [c.id, c]));
  const fotos = d.fotos.filter((f) => (!cli || f.clienteId === cli) && (!tipo || f.tipo === tipo) && (!etapa || f.etapa === etapa));

  // comparaciones: para cada cliente+tipo, primer "antes" y último "después"
  const comps = [];
  const claves = new Set(fotos.map((f) => `${f.clienteId}|${f.tipo}`));
  for (const k of claves) {
    const [cid, t] = k.split('|');
    const del = d.fotos.filter((f) => f.clienteId === Number(cid) && f.tipo === t);
    const antes = del.filter((f) => f.etapa === 'antes').sort((a, b) => new Date(a.fecha) - new Date(b.fecha))[0];
    const despues = del.filter((f) => f.etapa === 'despues').sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
    if (antes && despues) comps.push({ k, cliente: cMap.get(Number(cid)), tipo: t, antes, despues });
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>📸 Galería antes / después</h1>
        <div className="acciones"><button className="btn primary" onClick={() => setSubir(true)}>＋ Subir fotos</button></div>
      </header>
      <div className="filtros">
        <ClienteSelect value={cli} onChange={setCli} vacio="Todos los clientes" />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Piletas y jardines</option><option value="pileta">🏊 Piletas</option><option value="jardin">🌳 Jardines</option>
        </select>
        <select value={etapa} onChange={(e) => setEtapa(e.target.value)}>
          <option value="">Todas las etapas</option><option value="antes">Antes</option><option value="despues">Después</option><option value="otra">Otras</option>
        </select>
      </div>

      {comps.length > 0 && !etapa && (
        <section className="card">
          <h2>↔️ Comparaciones (deslizá)</h2>
          <div className="comps">
            {comps.map((c) => (
              <div key={c.k}>
                <Comparador antes={c.antes} despues={c.despues} />
                <div className="sm"><b>{c.cliente?.nombre}</b> · {c.tipo === 'pileta' ? '🏊 Pileta' : '🌳 Jardín'}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {fotos.length === 0 ? (
        <Vacio icono="📸">No hay fotos todavía.</Vacio>
      ) : (
        <div className="galeria">
          {fotos.map((f) => (
            <figure key={f.id} onClick={() => setVer(f)}>
              <Img blob={f.thumb || f.blob} />
              <figcaption>
                <span className={'tag ' + f.etapa}>{f.etapa === 'despues' ? 'Después' : f.etapa === 'antes' ? 'Antes' : 'Otra'}</span>
                <b>{cMap.get(f.clienteId)?.nombre}</b>
                <small>{f.tipo === 'pileta' ? '🏊' : '🌳'} {fmtFecha(f.fecha)}</small>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {subir && <Subir clienteId={cli} onClose={() => setSubir(false)} />}
      {ver && <Visor foto={ver} cliente={cMap.get(ver.clienteId)} onClose={() => setVer(null)} />}
    </div>
  );
}
