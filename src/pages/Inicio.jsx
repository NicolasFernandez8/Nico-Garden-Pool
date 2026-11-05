import { useLiveQuery } from 'dexie-react-hooks';
import { db, estadoProductos, getAjuste } from '../db';
import { ir } from '../nav';
import { Barra, Countdown, Stat, Vacio } from '../components/ui';
import { fmtFechaHora, inicioMes, finMes, money, mapsLink, nivelVencimiento, useNow } from '../utils';

export default function Inicio() {
  useNow(30000);
  const datos = useLiveQuery(async () => {
    const [clientes, productos, estados, movs, visitas, herramientas, insumos, horas] = await Promise.all([
      db.clientes.toArray(),
      db.productos.toArray(),
      estadoProductos(),
      db.movimientos.where('fecha').between(inicioMes().toISOString(), finMes().toISOString()).toArray(),
      db.visitas.toArray(),
      db.herramientas.toArray(),
      db.insumos.toArray(),
      getAjuste('avisoHorasAntes', 24),
    ]);
    return { clientes, productos, estados, movs, visitas, herramientas, insumos, horas: Number(horas) };
  }, []);
  if (!datos) return null;
  const { clientes, productos, estados, movs, visitas, herramientas, insumos, horas } = datos;
  const cMap = new Map(clientes.map((c) => [c.id, c]));
  const pMap = new Map(productos.map((p) => [p.id, p]));
  const activos = clientes.filter((c) => c.activo !== false);

  const alertas = estados
    .filter((a) => cMap.get(a.clienteId)?.activo !== false && !a.desactivado)
    .map((a) => ({ ...a, nivel: nivelVencimiento(a.proxima, horas) }))
    .filter((a) => a.nivel !== 'ok')
    .sort((a, b) => new Date(a.proxima) - new Date(b.proxima));

  const ingresos = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
  const egresos = movs.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);

  const ini = inicioMes().getTime(), fin = finMes().getTime();
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const manana = hoy.getTime() + 86400000;
  const visitasHoy = visitas
    .filter((v) => v.estado === 'programada' && new Date(v.fecha).getTime() < manana)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  const progreso = activos
    .filter((c) => Number(c.mantenimientosMes) > 0)
    .map((c) => ({
      c,
      hechas: visitas.filter((v) => v.clienteId === c.id && v.estado === 'hecha' && new Date(v.fecha).getTime() >= ini && new Date(v.fecha).getTime() < fin).length,
    }))
    .sort((a, b) => a.hechas / a.c.mantenimientosMes - b.hechas / b.c.mantenimientosMes);

  const pendientesCobro = activos
    .filter((c) => Number(c.abono) > 0)
    .map((c) => ({ c, pagado: movs.filter((m) => m.tipo === 'ingreso' && m.clienteId === c.id).reduce((s, m) => s + Number(m.monto), 0) }))
    .filter((x) => x.pagado < Number(x.c.abono));

  const faltan = herramientas.filter((h) => h.estado === 'falta');
  const reparar = herramientas.filter((h) => h.estado === 'reparar');
  const bajoStock = insumos.filter((i) => Number(i.stock) <= Number(i.minimo));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Hola Nico 👋</h1>
          <p className="muted">{new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </header>

      <div className="stats">
        <Stat titulo="Clientes activos" valor={activos.length} sub={`${clientes.length} en total`} onClick={() => ir('clientes')} />
        <Stat titulo="Ingresos del mes" valor={money(ingresos)} tono="verde" onClick={() => ir('caja')} />
        <Stat titulo="Egresos del mes" valor={money(egresos)} tono="rojo" onClick={() => ir('caja')} />
        <Stat titulo="Balance del mes" valor={money(ingresos - egresos)} tono={ingresos - egresos >= 0 ? 'verde' : 'rojo'} onClick={() => ir('caja')} />
      </div>

      <div className="grid2">
        <section className="card">
          <div className="card-head">
            <h2>🧪 Productos a reponer</h2>
            <a href="#/piletas">Ver todo</a>
          </div>
          {alertas.length === 0 ? (
            <Vacio icono="✅">Nada vencido ni por vencer en las próximas {horas} h.</Vacio>
          ) : (
            <ul className="lista">
              {alertas.slice(0, 8).map((a) => (
                <li key={a.id} className={'alerta ' + a.nivel} onClick={() => ir('cliente', a.clienteId)}>
                  <div>
                    <b>{cMap.get(a.clienteId)?.nombre}</b>
                    <small>{pMap.get(a.productoId)?.icono} {pMap.get(a.productoId)?.nombre}</small>
                  </div>
                  <Countdown fecha={a.proxima} horasAviso={horas} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>📅 Visitas de hoy y atrasadas</h2>
            <a href="#/visitas">Agenda</a>
          </div>
          {visitasHoy.length === 0 ? (
            <Vacio icono="🌤️">Sin visitas programadas para hoy.</Vacio>
          ) : (
            <ul className="lista">
              {visitasHoy.map((v) => {
                const c = cMap.get(v.clienteId);
                const atrasada = new Date(v.fecha) < hoy;
                return (
                  <li key={v.id} className={atrasada ? 'alerta vencido' : ''}>
                    <div onClick={() => ir('cliente', v.clienteId)}>
                      <b>{c?.nombre}</b>
                      <small>{fmtFechaHora(v.fecha)} · {v.tipo}{atrasada ? ' · atrasada' : ''}</small>
                    </div>
                    {mapsLink(c) && <a className="btn sm" href={mapsLink(c)} target="_blank" rel="noreferrer">📍 Ir</a>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>🔧 Mantenimientos del mes</h2>
          </div>
          {progreso.length === 0 ? (
            <Vacio>Cargá la cantidad de mantenimientos mensuales en cada cliente.</Vacio>
          ) : (
            <ul className="lista">
              {progreso.map(({ c, hechas }) => (
                <li key={c.id} onClick={() => ir('cliente', c.id)}>
                  <div style={{ flex: 1 }}>
                    <b>{c.nombre}</b>
                    <Barra valor={hechas} max={Number(c.mantenimientosMes)} />
                  </div>
                  <span className="pill">{hechas}/{c.mantenimientosMes}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>💸 Cobros pendientes del mes</h2>
          </div>
          {pendientesCobro.length === 0 ? (
            <Vacio icono="👌">Todos los abonos del mes están cobrados.</Vacio>
          ) : (
            <ul className="lista">
              {pendientesCobro.map(({ c, pagado }) => (
                <li key={c.id} onClick={() => ir('cliente', c.id)}>
                  <div>
                    <b>{c.nombre}</b>
                    <small>Abono {money(c.abono)} · pagó {money(pagado)}</small>
                  </div>
                  <span className="pill rojo">Debe {money(c.abono - pagado)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>🧰 Inventario</h2>
            <a href="#/inventario">Ver</a>
          </div>
          <ul className="lista">
            <li><div><b>Herramientas por comprar</b><small>{faltan.map((h) => h.nombre).join(', ') || '—'}</small></div><span className="pill">{faltan.length}</span></li>
            <li><div><b>Para reparar</b><small>{reparar.map((h) => h.nombre).join(', ') || '—'}</small></div><span className="pill">{reparar.length}</span></li>
            <li><div><b>Insumos bajo mínimo</b><small>{bajoStock.map((i) => `${i.nombre} (${i.stock} ${i.unidad})`).join(', ') || '—'}</small></div><span className={'pill ' + (bajoStock.length ? 'rojo' : '')}>{bajoStock.length}</span></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
