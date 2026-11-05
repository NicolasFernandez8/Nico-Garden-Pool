import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getAjuste, setAjuste } from '../db';
import { ir } from '../nav';
import { Campo, ClienteSelect, Modal, Stat, Vacio, confirmar } from '../components/ui';
import { fmtFecha, whatsappLink } from '../utils';

const ETAPAS = { nuevo: '🆕 Nuevo', contactado: '📞 Contactado', presupuestado: '📝 Presupuestado', ganado: '🏆 Ganado', perdido: '❌ Perdido' };

function ProspectoForm({ inicial, onClose }) {
  const [f, setF] = useState({ nombre: '', telefono: '', direccion: '', servicio: 'pileta', referidoPor: null, estado: 'nuevo', notas: '', ...inicial });
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  async function guardar(e) {
    e.preventDefault();
    f.id ? await db.prospectos.put(f) : await db.prospectos.add({ ...f, fecha: new Date().toISOString() });
    onClose();
  }
  return (
    <Modal titulo={f.id ? 'Editar contacto' : 'Nuevo contacto referido'} onClose={onClose}>
      <form className="form" onSubmit={guardar}>
        <Campo label="Nombre *" full><input value={f.nombre} onChange={set('nombre')} required autoFocus /></Campo>
        <Campo label="Teléfono"><input type="tel" value={f.telefono} onChange={set('telefono')} /></Campo>
        <Campo label="Servicio">
          <select value={f.servicio} onChange={set('servicio')}><option value="pileta">🏊 Pileta</option><option value="jardin">🌳 Jardín</option><option value="ambos">🏊🌳 Ambos</option></select>
        </Campo>
        <Campo label="Dirección" full><input value={f.direccion} onChange={set('direccion')} /></Campo>
        <Campo label="Lo recomendó"><ClienteSelect value={f.referidoPor} onChange={set('referidoPor')} vacio="— Nadie / otro medio —" /></Campo>
        <Campo label="Etapa"><select value={f.estado} onChange={set('estado')}>{Object.entries(ETAPAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <Campo label="Notas" full><input value={f.notas} onChange={set('notas')} /></Campo>
        <div className="form-actions full">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Referidos() {
  const [form, setForm] = useState(null);
  const [beneficio, setBeneficio] = useState('');
  useEffect(() => { getAjuste('beneficioReferido', '').then(setBeneficio); }, []);
  const d = useLiveQuery(async () => ({ clientes: await db.clientes.toArray(), prospectos: await db.prospectos.toArray() }), []);
  if (!d) return null;
  const cMap = new Map(d.clientes.map((c) => [c.id, c]));
  const referidos = d.clientes.filter((c) => c.referidoPor);
  const ranking = d.clientes
    .map((c) => ({ c, n: referidos.filter((r) => r.referidoPor === c.id).length, p: d.prospectos.filter((p) => p.referidoPor === c.id && !['ganado', 'perdido'].includes(p.estado)).length }))
    .filter((x) => x.n || x.p)
    .sort((a, b) => b.n - a.n || b.p - a.p);
  const pendientesBeneficio = referidos.filter((r) => !r.beneficioOtorgado);
  const abiertos = d.prospectos.filter((p) => !['ganado', 'perdido'].includes(p.estado));
  const ganados = d.prospectos.filter((p) => p.estado === 'ganado').length;
  const cerrados = d.prospectos.filter((p) => ['ganado', 'perdido'].includes(p.estado)).length;

  async function convertir(p) {
    const id = await db.clientes.add({ nombre: p.nombre, telefono: p.telefono, direccion: p.direccion, mapsUrl: '', referencias: '', mantenimientosMes: 4, servicio: p.servicio, abono: 0, referidoPor: p.referidoPor, activo: true, notas: p.notas, creado: new Date().toISOString() });
    await db.prospectos.update(p.id, { estado: 'ganado', clienteId: id });
    ir('cliente', id);
  }

  const msjPedido = (c) => `Hola ${c.nombre}! Gracias por confiar en Nico Garden & Pool 🌿🏊. Si conocés a alguien que necesite mantenimiento de pileta o jardín, recomendanos: ${beneficio ? 'por cada referido que se sume te damos ' + beneficio + '.' : ''}`;

  return (
    <div className="page">
      <header className="page-head">
        <h1>🤝 Sistema de referidos</h1>
        <div className="acciones"><button className="btn primary" onClick={() => setForm({})}>＋ Contacto referido</button></div>
      </header>
      <div className="stats">
        <Stat titulo="Clientes que llegaron por referido" valor={referidos.length} sub={d.clientes.length ? `${Math.round((referidos.length / d.clientes.length) * 100)}% de la cartera` : null} tono="verde" />
        <Stat titulo="Contactos en curso" valor={abiertos.length} />
        <Stat titulo="Tasa de cierre" valor={cerrados ? Math.round((ganados / cerrados) * 100) + '%' : '—'} sub={`${ganados} ganados`} />
        <Stat titulo="Beneficios por dar" valor={pendientesBeneficio.length} tono={pendientesBeneficio.length ? 'rojo' : ''} />
      </div>

      <section className="card">
        <h2>🎁 Beneficio por referido</h2>
        <div className="form-inline">
          <input value={beneficio} onChange={(e) => setBeneficio(e.target.value)} onBlur={() => setAjuste('beneficioReferido', beneficio)} placeholder="Ej: 10% de descuento en el próximo mes" />
        </div>
      </section>

      <div className="grid2">
        <section className="card">
          <h2>🏅 Ranking de clientes que más recomiendan</h2>
          {ranking.length === 0 ? <Vacio icono="🤝">Todavía no hay referidos. Al cargar un cliente, completá “Referido por”.</Vacio> : (
            <ul className="lista">
              {ranking.map(({ c, n, p }, i) => (
                <li key={c.id}>
                  <div onClick={() => ir('cliente', c.id)}><b>{['🥇', '🥈', '🥉'][i] || `${i + 1}.`} {c.nombre}</b><small>{n} cliente(s) · {p} contacto(s) en curso</small></div>
                  {whatsappLink(c.telefono) && <a className="btn-icon" href={whatsappLink(c.telefono, `Hola ${c.nombre}! Gracias por recomendarnos 🙌 — Nico Garden & Pool`)} target="_blank" rel="noreferrer">💬</a>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>🎁 Beneficios pendientes de otorgar</h2>
          {pendientesBeneficio.length === 0 ? <Vacio icono="✅">No hay beneficios pendientes.</Vacio> : (
            <ul className="lista">
              {pendientesBeneficio.map((r) => (
                <li key={r.id}>
                  <div><b>{cMap.get(r.referidoPor)?.nombre}</b><small>por traer a {r.nombre} · {fmtFecha(r.creado)}</small></div>
                  <button className="btn sm primary" onClick={() => db.clientes.update(r.id, { beneficioOtorgado: new Date().toISOString() })}>✔ Otorgado</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <h2>📇 Contactos referidos (embudo)</h2>
        {d.prospectos.length === 0 ? <Vacio>Cargá personas que te recomendaron y seguí su estado hasta que sean clientes.</Vacio> : (
          <div className="kanban">
            {Object.entries(ETAPAS).map(([k, v]) => (
              <div key={k} className="kanban-col">
                <h3>{v} <span className="pill">{d.prospectos.filter((p) => p.estado === k).length}</span></h3>
                {d.prospectos.filter((p) => p.estado === k).map((p) => (
                  <div key={p.id} className="kanban-card">
                    <b onClick={() => setForm(p)}>{p.nombre}</b>
                    <small className="muted">{p.referidoPor ? 'Por ' + (cMap.get(p.referidoPor)?.nombre || '—') : 'Sin referente'} · {fmtFecha(p.fecha)}</small>
                    {p.notas && <small>{p.notas}</small>}
                    <div className="fila-acc">
                      {whatsappLink(p.telefono) && <a className="btn-icon" href={whatsappLink(p.telefono, `Hola ${p.nombre}! Te escribo de Nico Garden & Pool${p.referidoPor ? ', nos pasó tu contacto ' + (cMap.get(p.referidoPor)?.nombre || '') : ''}.`)} target="_blank" rel="noreferrer">💬</a>}
                      <select value={p.estado} onChange={(e) => db.prospectos.update(p.id, { estado: e.target.value })}>{Object.entries(ETAPAS).map(([kk, vv]) => <option key={kk} value={kk}>{vv}</option>)}</select>
                      {k !== 'ganado' && k !== 'perdido' && <button className="btn sm primary" onClick={() => convertir(p)}>→ Cliente</button>}
                      <button className="btn-icon" onClick={() => confirmar('¿Borrar contacto?') && db.prospectos.delete(p.id)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>📣 Pedir recomendaciones</h2>
        <p className="muted sm">Mandale a tus clientes activos un mensaje por WhatsApp pidiendo que te recomienden.</p>
        <ul className="lista">
          {d.clientes.filter((c) => c.activo !== false && c.telefono).map((c) => (
            <li key={c.id}><div><b>{c.nombre}</b></div><a className="btn sm" href={whatsappLink(c.telefono, msjPedido(c))} target="_blank" rel="noreferrer">💬 Enviar</a></li>
          ))}
        </ul>
      </section>
      {form && <ProspectoForm inicial={form} onClose={() => setForm(null)} />}
    </div>
  );
}
