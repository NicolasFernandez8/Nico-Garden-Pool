import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { db } from '../db';
import { Campo, ClienteSelect, Modal, Stat, Vacio, confirmar } from '../components/ui';
import { DIA, MESES, aCSV, descargar, fmtFecha, inicioMes, inicioSemana, money, toDateInput } from '../utils';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const CAT_ING = ['Abono mensual', 'Mantenimiento', 'Trabajo extra', 'Venta de productos', 'Otro ingreso'];
const CAT_EGR = ['Productos químicos', 'Combustible', 'Herramientas', 'Reparaciones', 'Repuestos', 'Sueldos / ayudante', 'Transporte', 'Publicidad', 'Otro egreso'];

function colores() {
  const temaDark = document.documentElement.dataset.theme === 'dark' ||
    (document.documentElement.dataset.theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return temaDark
    ? { ing: '#3987e5', egr: '#d95926', texto: '#a8959f', grid: 'rgba(255,255,255,.07)', surface: '#1e1119' }
    : { ing: '#2a78d6', egr: '#eb6834', texto: '#7d6a73', grid: 'rgba(60,20,40,.07)', surface: '#ffffff' };
}

export function MovimientoForm({ inicial = {}, onClose }) {
  const [f, setF] = useState({ tipo: 'ingreso', monto: '', fecha: toDateInput(), categoria: '', clienteId: null, metodo: 'efectivo', descripcion: '', ...inicial, ...(inicial.fecha ? { fecha: toDateInput(inicial.fecha) } : {}) });
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const cats = f.tipo === 'ingreso' ? CAT_ING : CAT_EGR;
  async function guardar(e) {
    e.preventDefault();
    const datos = { ...f, monto: Number(f.monto), categoria: f.categoria || cats[0], fecha: new Date(f.fecha + 'T12:00').toISOString() };
    if (datos.id) await db.movimientos.put(datos); else await db.movimientos.add(datos);
    onClose();
  }
  return (
    <Modal titulo={f.id ? 'Editar movimiento' : 'Nuevo movimiento'} onClose={onClose}>
      <form className="form" onSubmit={guardar}>
        <div className="tabs full">
          <button type="button" className={f.tipo === 'ingreso' ? 'on verde' : ''} onClick={() => setF({ ...f, tipo: 'ingreso', categoria: '' })}>⬆️ Ingreso</button>
          <button type="button" className={f.tipo === 'egreso' ? 'on rojo' : ''} onClick={() => setF({ ...f, tipo: 'egreso', categoria: '' })}>⬇️ Egreso</button>
        </div>
        <Campo label="Monto ($) *"><input type="number" min="0" step="any" value={f.monto} onChange={set('monto')} required autoFocus /></Campo>
        <Campo label="Fecha"><input type="date" value={f.fecha} onChange={set('fecha')} required /></Campo>
        <Campo label="Categoría">
          <select value={f.categoria || cats[0]} onChange={set('categoria')}>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo label="Método">
          <select value={f.metodo} onChange={set('metodo')}>
            <option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="mercadopago">Mercado Pago</option><option value="otro">Otro</option>
          </select>
        </Campo>
        <Campo label="Cliente (opcional)" full><ClienteSelect value={f.clienteId} onChange={set('clienteId')} vacio="— Sin cliente —" /></Campo>
        <Campo label="Descripción" full><input value={f.descripcion} onChange={set('descripcion')} /></Campo>
        <div className="form-actions full">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function rango(periodo, desde, hasta) {
  const now = new Date();
  if (periodo === 'semana') return [inicioSemana(now), new Date(inicioSemana(now).getTime() + 7 * DIA)];
  if (periodo === 'mes') return [inicioMes(now), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
  if (periodo === 'mesant') return [new Date(now.getFullYear(), now.getMonth() - 1, 1), inicioMes(now)];
  if (periodo === 'anio') return [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1)];
  if (periodo === 'custom') return [desde ? new Date(desde + 'T00:00') : new Date(0), hasta ? new Date(new Date(hasta + 'T00:00').getTime() + DIA) : new Date(8.64e15)];
  return [new Date(0), new Date(8.64e15)];
}

const suma = (arr, tipo) => arr.filter((m) => m.tipo === tipo).reduce((s, m) => s + Number(m.monto), 0);

function GraficoBarras({ labels, ing, egr }) {
  const c = colores();
  return (
    <div className="chart">
      <Bar
        data={{
          labels,
          datasets: [
            { label: 'Ingresos', data: ing, backgroundColor: c.ing, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22, borderColor: c.surface, borderWidth: { left: 1, right: 1 } },
            { label: 'Egresos', data: egr, backgroundColor: c.egr, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22, borderColor: c.surface, borderWidth: { left: 1, right: 1 } },
          ],
        }}
        options={{
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', align: 'start', labels: { color: c.texto, boxWidth: 12, boxHeight: 12, useBorderRadius: true, borderRadius: 3 } },
            tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${money(x.raw)}`, footer: (it) => `Balance: ${money((it[0]?.raw || 0) - (it[1]?.raw || 0))}` } },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: c.texto } },
            y: { beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { color: c.texto, callback: (v) => money(v), maxTicksLimit: 5 } },
          },
        }}
      />
    </div>
  );
}

function GraficoCategorias({ datos }) {
  const c = colores();
  return (
    <div className="chart" style={{ height: Math.max(140, datos.length * 34 + 40) }}>
      <Bar
        data={{ labels: datos.map((d) => d[0]), datasets: [{ label: 'Egresos', data: datos.map((d) => d[1]), backgroundColor: c.egr, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 18 }] }}
        options={{
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => money(x.raw) } } },
          scales: { x: { beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { color: c.texto, callback: (v) => money(v), maxTicksLimit: 4 } }, y: { grid: { display: false }, ticks: { color: c.texto } } },
        }}
      />
    </div>
  );
}

export default function Caja() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    window.addEventListener('ngp-tema', f);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', f);
    return () => { window.removeEventListener('ngp-tema', f); mq.removeEventListener?.('change', f); };
  }, []);
  const [periodo, setPeriodo] = useState('mes');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [cli, setCli] = useState(null);
  const [graf, setGraf] = useState('semanal');
  const [form, setForm] = useState(null);
  const d = useLiveQuery(async () => ({ movs: await db.movimientos.orderBy('fecha').reverse().toArray(), clientes: await db.clientes.toArray() }), []);
  if (!d) return null;
  const cMap = new Map(d.clientes.map((c) => [c.id, c]));
  const [ini, fin] = rango(periodo, desde, hasta);
  const delCli = d.movs.filter((m) => !cli || m.clienteId === cli);
  const enRango = delCli.filter((m) => { const t = new Date(m.fecha); return t >= ini && t < fin; });
  const ingresos = suma(enRango, 'ingreso'), egresos = suma(enRango, 'egreso');
  const totalIng = suma(delCli, 'ingreso'), totalEgr = suma(delCli, 'egreso');

  // series temporales
  let labels = [], ing = [], egr = [];
  if (graf === 'semanal') {
    const base = inicioSemana();
    for (let i = 7; i >= 0; i--) {
      const a = new Date(base.getTime() - i * 7 * DIA), b = new Date(a.getTime() + 7 * DIA);
      const ms = delCli.filter((m) => new Date(m.fecha) >= a && new Date(m.fecha) < b);
      labels.push(`${a.getDate()}/${a.getMonth() + 1}`); ing.push(suma(ms, 'ingreso')); egr.push(suma(ms, 'egreso'));
    }
  } else if (graf === 'mensual') {
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const a = new Date(now.getFullYear(), now.getMonth() - i, 1), b = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const ms = delCli.filter((m) => new Date(m.fecha) >= a && new Date(m.fecha) < b);
      labels.push(`${MESES[a.getMonth()]} ${String(a.getFullYear()).slice(2)}`); ing.push(suma(ms, 'ingreso')); egr.push(suma(ms, 'egreso'));
    }
  } else {
    // diario de la semana actual
    const base = inicioSemana();
    const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    for (let i = 0; i < 7; i++) {
      const a = new Date(base.getTime() + i * DIA), b = new Date(a.getTime() + DIA);
      const ms = delCli.filter((m) => new Date(m.fecha) >= a && new Date(m.fecha) < b);
      labels.push(dias[i]); ing.push(suma(ms, 'ingreso')); egr.push(suma(ms, 'egreso'));
    }
  }

  // por cliente
  const porCliente = new Map();
  for (const m of enRango) {
    const k = m.clienteId || 0;
    const x = porCliente.get(k) || { ing: 0, egr: 0, n: 0 };
    x[m.tipo === 'ingreso' ? 'ing' : 'egr'] += Number(m.monto); x.n++;
    porCliente.set(k, x);
  }
  const filasCli = [...porCliente.entries()].sort((a, b) => b[1].ing - a[1].ing);

  const porCat = {};
  enRango.filter((m) => m.tipo === 'egreso').forEach((m) => { porCat[m.categoria] = (porCat[m.categoria] || 0) + Number(m.monto); });
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);

  const exportar = () => descargar('caja.csv', aCSV(enRango, [
    { titulo: 'Fecha', valor: (m) => fmtFecha(m.fecha) }, { titulo: 'Tipo', valor: 'tipo' }, { titulo: 'Monto', valor: 'monto' },
    { titulo: 'Categoría', valor: 'categoria' }, { titulo: 'Cliente', valor: (m) => cMap.get(m.clienteId)?.nombre || '' },
    { titulo: 'Método', valor: 'metodo' }, { titulo: 'Descripción', valor: 'descripcion' },
  ]), 'text/csv');

  return (
    <div className="page">
      <header className="page-head">
        <h1>💰 Caja</h1>
        <div className="acciones">
          <button className="btn" onClick={exportar}>⬇️ Planilla</button>
          <button className="btn rojo" onClick={() => setForm({ tipo: 'egreso' })}>－ Egreso</button>
          <button className="btn primary" onClick={() => setForm({ tipo: 'ingreso' })}>＋ Ingreso</button>
        </div>
      </header>

      <div className="filtros">
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
          <option value="semana">Esta semana</option><option value="mes">Este mes</option><option value="mesant">Mes anterior</option>
          <option value="anio">Este año</option><option value="todo">Todo</option><option value="custom">Personalizado</option>
        </select>
        {periodo === 'custom' && <><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></>}
        <ClienteSelect value={cli} onChange={setCli} vacio="Todos los clientes" />
      </div>

      <div className="stats">
        <Stat titulo="Ingresos del período" valor={money(ingresos)} tono="verde" />
        <Stat titulo="Egresos del período" valor={money(egresos)} tono="rojo" />
        <Stat titulo="Balance del período" valor={money(ingresos - egresos)} tono={ingresos >= egresos ? 'verde' : 'rojo'} sub={ingresos ? `Margen ${Math.round(((ingresos - egresos) / ingresos) * 100)}%` : null} />
        <Stat titulo="Total histórico" valor={money(totalIng - totalEgr)} sub={`${money(totalIng)} ingresos · ${money(totalEgr)} egresos`} />
      </div>

      <section className="card">
        <div className="card-head">
          <h2>📊 Ingresos vs egresos</h2>
          <div className="tabs">
            <button className={graf === 'diario' ? 'on' : ''} onClick={() => setGraf('diario')}>Esta semana</button>
            <button className={graf === 'semanal' ? 'on' : ''} onClick={() => setGraf('semanal')}>8 semanas</button>
            <button className={graf === 'mensual' ? 'on' : ''} onClick={() => setGraf('mensual')}>12 meses</button>
          </div>
        </div>
        <GraficoBarras labels={labels} ing={ing} egr={egr} />
      </section>

      <div className="grid2">
        <section className="card">
          <h2>👥 Por cliente (período)</h2>
          {filasCli.length === 0 ? <Vacio>Sin movimientos.</Vacio> : (
            <div className="tabla-wrap fija"><table className="tabla compacta">
              <thead><tr><th>Cliente</th><th className="num">Ingresos</th><th className="num">Egresos</th><th className="num">Neto</th></tr></thead>
              <tbody>
                {filasCli.map(([id, x]) => (
                  <tr key={id}>
                    <td>{id ? <a href={'#/cliente/' + id}>{cMap.get(id)?.nombre || '—'}</a> : <span className="muted">Sin cliente</span>}</td>
                    <td className="num">{money(x.ing)}</td><td className="num">{money(x.egr)}</td><td className="num"><b>{money(x.ing - x.egr)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>
        <section className="card">
          <h2>🧾 Egresos por categoría</h2>
          {cats.length === 0 ? <Vacio>Sin egresos en el período.</Vacio> : (
            <>
              <GraficoCategorias datos={cats} />
              <div className="tabla-wrap fija"><table className="tabla compacta">
                <tbody>{cats.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{money(v)}</td><td className="num muted">{Math.round((v / egresos) * 100)}%</td></tr>)}</tbody>
              </table></div>
            </>
          )}
        </section>
      </div>

      <section className="card">
        <h2>📒 Movimientos ({enRango.length})</h2>
        {enRango.length === 0 ? <Vacio icono="💰">No hay movimientos en este período.</Vacio> : (
          <div className="tabla-wrap">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Concepto</th><th>Cliente</th><th>Método</th><th className="num">Monto</th><th></th></tr></thead>
              <tbody>
                {enRango.map((m) => (
                  <tr key={m.id}>
                    <td data-l="Fecha">{fmtFecha(m.fecha)}</td>
                    <td data-l="Concepto"><b>{m.categoria}</b>{m.descripcion && <div className="muted sm">{m.descripcion}</div>}</td>
                    <td data-l="Cliente">{cMap.get(m.clienteId)?.nombre || '—'}</td>
                    <td data-l="Método">{m.metodo}</td>
                    <td data-l="Monto" className={'num ' + (m.tipo === 'ingreso' ? 't-verde' : 't-rojo')}><b>{m.tipo === 'ingreso' ? '+' : '−'}{money(m.monto)}</b></td>
                    <td className="fila-acc">
                      <button className="btn-icon" onClick={() => setForm(m)}>✏️</button>
                      <button className="btn-icon" onClick={() => confirmar('¿Borrar movimiento?') && db.movimientos.delete(m.id)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {form && <MovimientoForm inicial={form} onClose={() => setForm(null)} />}
    </div>
  );
}
