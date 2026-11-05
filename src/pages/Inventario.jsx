import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Campo, Modal, Stat, Vacio, confirmar } from '../components/ui';
import { money } from '../utils';

const ESTADOS = { tengo: '✅ La tenemos', falta: '🛒 Falta comprar', reparar: '🔧 Para reparar', prestada: '🤝 Prestada' };
const PRIOR = { alta: '🔴 Alta', media: '🟡 Media', baja: '🟢 Baja' };

function HerramientaForm({ inicial, onClose }) {
  const [f, setF] = useState({ nombre: '', estado: 'tengo', cantidad: 1, costo: '', prioridad: 'media', categoria: 'Pileta', notas: '', ...inicial });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function guardar(e) {
    e.preventDefault();
    const d = { ...f, cantidad: Number(f.cantidad) || 0, costo: Number(f.costo) || 0 };
    d.id ? await db.herramientas.put(d) : await db.herramientas.add(d);
    onClose();
  }
  return (
    <Modal titulo={f.id ? 'Editar herramienta' : 'Nueva herramienta'} onClose={onClose}>
      <form className="form" onSubmit={guardar}>
        <Campo label="Nombre *" full><input value={f.nombre} onChange={set('nombre')} required autoFocus /></Campo>
        <Campo label="Estado"><select value={f.estado} onChange={set('estado')}>{Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <Campo label="Categoría"><select value={f.categoria} onChange={set('categoria')}><option>Pileta</option><option>Jardín</option><option>General</option><option>Seguridad</option><option>Vehículo</option></select></Campo>
        <Campo label="Cantidad"><input type="number" min="0" value={f.cantidad} onChange={set('cantidad')} /></Campo>
        <Campo label="Costo estimado ($)"><input type="number" min="0" value={f.costo} onChange={set('costo')} /></Campo>
        <Campo label="Prioridad"><select value={f.prioridad} onChange={set('prioridad')}>{Object.entries(PRIOR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <Campo label="Notas (marca, dónde comprar…)" full><input value={f.notas} onChange={set('notas')} /></Campo>
        <div className="form-actions full">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function Insumos() {
  const insumos = useLiveQuery(() => db.insumos.toArray(), []) || [];
  const [n, setN] = useState({ nombre: '', stock: '', minimo: '', unidad: '' });
  return (
    <section className="card">
      <h2>🧴 Insumos y stock</h2>
      <p className="muted sm">Al registrar un producto colocado en una pileta podés descontarlo de acá automáticamente.</p>
      <div className="tabla-wrap fija">
        <table className="tabla compacta">
          <thead><tr><th>Insumo</th><th className="num">Stock</th><th className="num">Mínimo</th><th>Unidad</th><th></th></tr></thead>
          <tbody>
            {insumos.map((i) => (
              <tr key={i.id} className={Number(i.stock) <= Number(i.minimo) ? 'bajo' : ''}>
                <td><input value={i.nombre} onChange={(e) => db.insumos.update(i.id, { nombre: e.target.value })} /></td>
                <td className="num"><div className="stepper">
                  <button onClick={() => db.insumos.update(i.id, { stock: Math.max(0, Number(i.stock) - 1) })}>−</button>
                  <input className="mini" type="number" value={i.stock} onChange={(e) => db.insumos.update(i.id, { stock: Number(e.target.value) })} />
                  <button onClick={() => db.insumos.update(i.id, { stock: Number(i.stock) + 1 })}>＋</button>
                </div></td>
                <td className="num"><input className="mini" type="number" value={i.minimo} onChange={(e) => db.insumos.update(i.id, { minimo: Number(e.target.value) })} /></td>
                <td><input className="mini" value={i.unidad} onChange={(e) => db.insumos.update(i.id, { unidad: e.target.value })} /></td>
                <td>{Number(i.stock) <= Number(i.minimo) && <span className="pill rojo">Reponer</span>} <button className="btn-icon" onClick={() => confirmar(`¿Borrar ${i.nombre}?`) && db.insumos.delete(i.id)}>🗑️</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="form-inline" onSubmit={(e) => { e.preventDefault(); if (n.nombre) { db.insumos.add({ ...n, stock: Number(n.stock) || 0, minimo: Number(n.minimo) || 0 }); setN({ nombre: '', stock: '', minimo: '', unidad: '' }); } }}>
        <input placeholder="Nuevo insumo" value={n.nombre} onChange={(e) => setN({ ...n, nombre: e.target.value })} />
        <input className="mini" type="number" placeholder="Stock" value={n.stock} onChange={(e) => setN({ ...n, stock: e.target.value })} />
        <input className="mini" type="number" placeholder="Mín." value={n.minimo} onChange={(e) => setN({ ...n, minimo: e.target.value })} />
        <input className="mini" placeholder="Unidad" value={n.unidad} onChange={(e) => setN({ ...n, unidad: e.target.value })} />
        <button className="btn primary">＋</button>
      </form>
    </section>
  );
}

export default function Inventario() {
  const [form, setForm] = useState(null);
  const [filtro, setFiltro] = useState('');
  const hs = useLiveQuery(() => db.herramientas.orderBy('nombre').toArray(), []) || [];
  const lista = hs.filter((h) => !filtro || h.estado === filtro);
  const faltan = hs.filter((h) => h.estado === 'falta');
  const costoFaltan = faltan.reduce((s, h) => s + Number(h.costo) * Math.max(1, Number(h.cantidad) || 1), 0);
  const prioOrden = { alta: 0, media: 1, baja: 2 };

  async function comprada(h) {
    const registrar = Number(h.costo) > 0 && confirmar(`¿Registrar el gasto de ${money(h.costo * Math.max(1, h.cantidad))} en Caja?`);
    await db.herramientas.update(h.id, { estado: 'tengo' });
    if (registrar) await db.movimientos.add({ tipo: 'egreso', monto: h.costo * Math.max(1, h.cantidad), fecha: new Date().toISOString(), categoria: 'Herramientas', clienteId: null, metodo: 'efectivo', descripcion: 'Compra: ' + h.nombre });
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>🧰 Inventario</h1>
        <div className="acciones"><button className="btn primary" onClick={() => setForm({})}>＋ Herramienta</button></div>
      </header>
      <div className="stats">
        <Stat titulo="Herramientas que tenemos" valor={hs.filter((h) => h.estado === 'tengo').length} tono="verde" onClick={() => setFiltro('tengo')} />
        <Stat titulo="Faltan comprar" valor={faltan.length} sub={`Presupuesto: ${money(costoFaltan)}`} tono="rojo" onClick={() => setFiltro('falta')} />
        <Stat titulo="Para reparar" valor={hs.filter((h) => h.estado === 'reparar').length} onClick={() => setFiltro('reparar')} />
        <Stat titulo="Total registradas" valor={hs.length} onClick={() => setFiltro('')} />
      </div>

      {faltan.length > 0 && (
        <section className="card borde-amarillo">
          <h2>🛒 Lista de compras</h2>
          <ul className="lista">
            {[...faltan].sort((a, b) => prioOrden[a.prioridad] - prioOrden[b.prioridad]).map((h) => (
              <li key={h.id}>
                <div><b>{h.nombre}</b><small>{PRIOR[h.prioridad]} · {h.categoria}{h.costo ? ' · ' + money(h.costo) : ''}{h.notas ? ' · ' + h.notas : ''}</small></div>
                <button className="btn sm primary" onClick={() => comprada(h)}>✔ Comprada</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>🔨 Herramientas</h2>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todas</option>{Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {lista.length === 0 ? <Vacio icono="🧰">Sin herramientas en esta vista.</Vacio> : (
          <div className="tabla-wrap">
            <table className="tabla">
              <thead><tr><th>Herramienta</th><th>Categoría</th><th>Estado</th><th className="num">Cant.</th><th className="num">Costo</th><th>Prioridad</th><th></th></tr></thead>
              <tbody>
                {lista.map((h) => (
                  <tr key={h.id}>
                    <td data-l="Herramienta"><b>{h.nombre}</b>{h.notas && <div className="muted sm">{h.notas}</div>}</td>
                    <td data-l="Categoría">{h.categoria}</td>
                    <td data-l="Estado">
                      <select value={h.estado} onChange={(e) => db.herramientas.update(h.id, { estado: e.target.value })}>
                        {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td data-l="Cant." className="num">{h.cantidad}</td>
                    <td data-l="Costo" className="num">{h.costo ? money(h.costo) : '—'}</td>
                    <td data-l="Prioridad">{PRIOR[h.prioridad]}</td>
                    <td className="fila-acc">
                      <button className="btn-icon" onClick={() => setForm(h)}>✏️</button>
                      <button className="btn-icon" onClick={() => confirmar(`¿Borrar ${h.nombre}?`) && db.herramientas.delete(h.id)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Insumos />
      {form && <HerramientaForm inicial={form} onClose={() => setForm(null)} />}
    </div>
  );
}
