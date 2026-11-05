import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getAjuste } from '../db';
import { ir } from '../nav';
import { Barra, Countdown, Stat, Vacio, confirmar } from '../components/ui';
import { ClienteForm } from './Clientes';
import { AplicacionForm, cancelarAvisos } from './Piletas';
import { VisitaForm, CompletarVisita } from './Visitas';
import { MovimientoForm } from './Caja';
import { finMes, fmtFecha, fmtFechaHora, inicioMes, mapsLink, money, whatsappLink } from '../utils';

function Thumb({ blob }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return url ? <img src={url} alt="" loading="lazy" /> : null;
}

const SERV = { pileta: '🏊 Pileta', jardin: '🌳 Jardín', ambos: '🏊🌳 Pileta + Jardín' };

export default function ClienteDetalle({ id }) {
  const [modal, setModal] = useState(null);
  const d = useLiveQuery(async () => {
    const c = await db.clientes.get(id);
    if (!c) return { c: null };
    const [apps, visitas, fotos, movs, productos, referidos, horas] = await Promise.all([
      db.aplicaciones.where('clienteId').equals(id).sortBy('fecha'),
      db.visitas.where('clienteId').equals(id).sortBy('fecha'),
      db.fotos.where('clienteId').equals(id).reverse().sortBy('fecha'),
      db.movimientos.where('clienteId').equals(id).reverse().sortBy('fecha'),
      db.productos.toArray(),
      db.clientes.where('referidoPor').equals(id).toArray(),
      getAjuste('avisoHorasAntes', 24),
    ]);
    const referente = c.referidoPor ? await db.clientes.get(c.referidoPor) : null;
    return { c, apps, visitas, fotos, movs, productos, referidos, referente, horas: Number(horas) };
  }, [id]);
  if (!d) return null;
  if (!d.c) return <div className="page"><Vacio icono="❓">Cliente no encontrado. <a href="#/clientes">Volver</a></Vacio></div>;
  const { c, apps, visitas, fotos, movs, productos, referidos, referente, horas } = d;
  const pMap = new Map(productos.map((p) => [p.id, p]));
  const ultimas = new Map();
  apps.forEach((a) => ultimas.set(a.productoId, a));
  const estado = [...ultimas.values()].sort((a, b) => new Date(a.proxima) - new Date(b.proxima));
  const ini = inicioMes(), fin = finMes();
  const hechasMes = visitas.filter((v) => v.estado === 'hecha' && new Date(v.fecha) >= ini && new Date(v.fecha) < fin).length;
  const pendientes = visitas.filter((v) => v.estado === 'programada');
  const hechas = visitas.filter((v) => v.estado === 'hecha').reverse();
  const ingMes = movs.filter((m) => m.tipo === 'ingreso' && new Date(m.fecha) >= ini && new Date(m.fecha) < fin).reduce((s, m) => s + Number(m.monto), 0);
  const ingTotal = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
  const egrTotal = movs.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);
  const pileta = c.servicio !== 'jardin';

  async function borrar() {
    if (!confirmar(`¿Borrar a ${c.nombre} y TODOS sus datos (visitas, productos, fotos y movimientos)? No se puede deshacer.`)) return;
    for (const a of apps) await cancelarAvisos(a.id);
    await Promise.all([
      db.aplicaciones.where('clienteId').equals(id).delete(),
      db.visitas.where('clienteId').equals(id).delete(),
      db.fotos.where('clienteId').equals(id).delete(),
      db.movimientos.where('clienteId').equals(id).delete(),
      db.clientes.where('referidoPor').equals(id).modify({ referidoPor: null }),
    ]);
    await db.clientes.delete(id);
    ir('clientes');
  }

  return (
    <div className="page">
      <a href="#/clientes" className="volver">← Clientes</a>
      <header className="page-head">
        <div>
          <h1>{c.nombre} {c.activo === false && <span className="pill">Inactivo</span>}</h1>
          <p className="muted">{SERV[c.servicio]} · {c.mantenimientosMes} mantenimientos/mes · abono {money(c.abono)}{c.diasVisita ? ' · ' + c.diasVisita : ''}</p>
        </div>
        <div className="acciones">
          {mapsLink(c) && <a className="btn" href={mapsLink(c)} target="_blank" rel="noreferrer">📍 Maps</a>}
          {whatsappLink(c.telefono) && <a className="btn" href={whatsappLink(c.telefono)} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
          {c.telefono && <a className="btn" href={'tel:' + c.telefono}>📞</a>}
          <button className="btn" onClick={() => setModal({ t: 'editar' })}>✏️ Editar</button>
        </div>
      </header>

      <section className="card">
        <div className="info-grid">
          <div><small className="muted">Dirección</small><div>{c.direccion || '—'}</div></div>
          <div><small className="muted">Teléfono</small><div>{c.telefono || '—'}</div></div>
          <div><small className="muted">Referencias</small><div>{c.referencias || '—'}</div></div>
          <div><small className="muted">Referido por</small><div>{referente ? <a href={'#/cliente/' + referente.id}>{referente.nombre}</a> : '—'}</div></div>
          {c.notas && <div><small className="muted">Notas</small><div>{c.notas}</div></div>}
          {referidos.length > 0 && <div><small className="muted">Recomendó a</small><div>{referidos.map((r) => <a key={r.id} href={'#/cliente/' + r.id} className="pill">{r.nombre}</a>)}</div></div>}
        </div>
      </section>

      <div className="stats">
        <Stat titulo="Mantenimientos este mes" valor={`${hechasMes}/${c.mantenimientosMes || 0}`} sub={<Barra valor={hechasMes} max={c.mantenimientosMes || 0} />} />
        <Stat titulo="Cobrado este mes" valor={money(ingMes)} tono={c.abono && ingMes < c.abono ? 'rojo' : 'verde'} sub={c.abono ? (ingMes < c.abono ? `Debe ${money(c.abono - ingMes)}` : 'Abono al día') : null} />
        <Stat titulo="Ingresos históricos" valor={money(ingTotal)} sub={egrTotal ? `Gastos asociados ${money(egrTotal)}` : null} />
        <Stat titulo="Fotos" valor={fotos.length} onClick={() => ir('galeria', id)} />
      </div>

      {pileta && (
        <section className="card">
          <div className="card-head">
            <h2>🧪 Productos en la pileta</h2>
            <button className="btn sm primary" onClick={() => setModal({ t: 'app', v: { clienteId: id } })}>＋ Registrar</button>
          </div>
          {estado.length === 0 ? <Vacio icono="🏊">Sin productos registrados.</Vacio> : (
            <ul className="lista">
              {estado.map((a) => (
                <li key={a.id}>
                  <div>
                    <b>{pMap.get(a.productoId)?.icono} {pMap.get(a.productoId)?.nombre}</b>
                    <small>Colocado {fmtFechaHora(a.fecha)} · reponer {fmtFechaHora(a.proxima)}</small>
                  </div>
                  <div className="col-der">
                    {a.desactivado ? <span className="countdown off">Pausado</span> : <Countdown fecha={a.proxima} horasAviso={horas} />}
                    <button className="btn sm" onClick={() => setModal({ t: 'app', v: { clienteId: id, productoId: a.productoId, intervaloDias: a.intervaloDias, cantidad: a.cantidad } })}>✔ Repuesto</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid2">
        <section className="card">
          <div className="card-head">
            <h2>📅 Visitas</h2>
            <button className="btn sm primary" onClick={() => setModal({ t: 'visita' })}>＋ Programar</button>
          </div>
          {pendientes.length === 0 && hechas.length === 0 && <Vacio>Sin visitas.</Vacio>}
          <ul className="lista">
            {pendientes.map((v) => (
              <li key={v.id}>
                <div><b>{fmtFechaHora(v.fecha)}</b><small>Programada · {v.tipo}</small></div>
                <button className="btn sm primary" onClick={() => setModal({ t: 'completar', v })}>✔ Hecha</button>
              </li>
            ))}
            {hechas.slice(0, 15).map((v) => (
              <li key={v.id} className="hecha">
                <div><b>✅ {fmtFechaHora(v.fecha)}</b><small>{v.tareas || v.tipo}{v.ph ? ` · pH ${v.ph}` : ''}{v.cloro ? ` · Cl ${v.cloro} ppm` : ''}</small></div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>💰 Pagos y gastos</h2>
            <button className="btn sm primary" onClick={() => setModal({ t: 'mov', v: { tipo: 'ingreso', clienteId: id, categoria: 'Abono mensual', monto: c.abono || '' } })}>＋ Cobro</button>
          </div>
          {movs.length === 0 ? <Vacio>Sin movimientos.</Vacio> : (
            <ul className="lista">
              {movs.slice(0, 15).map((m) => (
                <li key={m.id} onClick={() => setModal({ t: 'mov', v: m })}>
                  <div><b>{m.categoria}</b><small>{fmtFecha(m.fecha)} · {m.metodo}{m.descripcion ? ' · ' + m.descripcion : ''}</small></div>
                  <b className={m.tipo === 'ingreso' ? 't-verde' : 't-rojo'}>{m.tipo === 'ingreso' ? '+' : '−'}{money(m.monto)}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>📸 Fotos</h2>
          <a className="btn sm" href={'#/galeria/' + id}>Ver galería / subir</a>
        </div>
        {fotos.length === 0 ? <Vacio>Sin fotos.</Vacio> : (
          <div className="galeria mini">
            {fotos.slice(0, 8).map((f) => (
              <figure key={f.id} onClick={() => ir('galeria', id)}><Thumb blob={f.thumb || f.blob} /><figcaption><span className={'tag ' + f.etapa}>{f.etapa}</span><small>{fmtFecha(f.fecha)}</small></figcaption></figure>
            ))}
          </div>
        )}
      </section>

      <div className="zona-peligro"><button className="btn ghost rojo" onClick={borrar}>🗑️ Borrar cliente</button></div>

      {modal?.t === 'editar' && <ClienteForm inicial={c} onClose={() => setModal(null)} />}
      {modal?.t === 'app' && <AplicacionForm inicial={modal.v} onClose={() => setModal(null)} />}
      {modal?.t === 'visita' && <VisitaForm inicial={{ clienteId: id, tipo: c.servicio }} onClose={() => setModal(null)} />}
      {modal?.t === 'completar' && <CompletarVisita visita={modal.v} onClose={() => setModal(null)} />}
      {modal?.t === 'mov' && <MovimientoForm inicial={modal.v} onClose={() => setModal(null)} />}
    </div>
  );
}
