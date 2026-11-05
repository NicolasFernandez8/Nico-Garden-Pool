import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getAjuste, setAjuste } from '../db';
import { Vacio } from '../components/ui';
import { DIA } from '../utils';

const WMO = {
  0: ['☀️', 'Despejado'], 1: ['🌤️', 'Mayormente despejado'], 2: ['⛅', 'Parcialmente nublado'], 3: ['☁️', 'Nublado'],
  45: ['🌫️', 'Niebla'], 48: ['🌫️', 'Niebla'], 51: ['🌦️', 'Llovizna leve'], 53: ['🌦️', 'Llovizna'], 55: ['🌧️', 'Llovizna intensa'],
  61: ['🌧️', 'Lluvia leve'], 63: ['🌧️', 'Lluvia'], 65: ['🌧️', 'Lluvia fuerte'], 66: ['🌧️', 'Lluvia helada'], 67: ['🌧️', 'Lluvia helada'],
  71: ['🌨️', 'Nieve'], 73: ['🌨️', 'Nieve'], 75: ['🌨️', 'Nieve'], 80: ['🌦️', 'Chaparrones'], 81: ['🌧️', 'Chaparrones'], 82: ['⛈️', 'Chaparrones fuertes'],
  95: ['⛈️', 'Tormenta'], 96: ['⛈️', 'Tormenta con granizo'], 99: ['⛈️', 'Tormenta con granizo'],
};

/**
 * Recomendador inteligente (corre 100% en el dispositivo, sin enviar datos).
 * Puntúa cada día de 0 a 100 para pileta y para jardín según lluvia,
 * viento, temperatura y lluvia del día siguiente.
 */
export function evaluarDia(d, siguiente) {
  const motivos = [];
  let pileta = 100, jardin = 100;
  const p = d.prob ?? 0, mm = d.mm ?? 0;
  pileta -= p * 0.6; jardin -= p * 0.7;
  if (mm >= 5) { pileta -= 25; jardin -= 30; motivos.push(`${mm.toFixed(1)} mm de lluvia`); }
  else if (mm >= 1) { pileta -= 10; jardin -= 15; motivos.push('algo de lluvia'); }
  if (p >= 60) motivos.push(`${p}% de probabilidad de lluvia`);
  if ([95, 96, 99].includes(d.codigo)) { pileta -= 40; jardin -= 40; motivos.push('tormenta eléctrica'); }
  if (d.viento >= 35) { pileta -= 20; jardin -= 25; motivos.push(`viento fuerte (${Math.round(d.viento)} km/h)`); }
  else if (d.viento >= 25) { pileta -= 8; jardin -= 12; motivos.push('bastante viento (vuelan hojas)'); }
  if (d.max >= 34) { pileta -= 10; jardin -= 15; motivos.push(`mucho calor (${Math.round(d.max)}°)`); }
  if (d.max <= 8) { pileta -= 10; jardin -= 10; motivos.push('mucho frío'); }
  // si llueve fuerte mañana, el cloro de hoy se diluye y el pasto queda húmedo pasado
  if (siguiente && (siguiente.prob >= 70 || siguiente.mm >= 5)) { pileta -= 12; motivos.push('mañana llueve: el cloro se diluye'); }
  // día después de lluvia fuerte: pasto mojado, pileta sucia (conviene limpiar)
  if (d.lluviaAyer >= 5) { jardin -= 15; pileta += 5; motivos.push('llovió ayer: pasto húmedo / pileta para limpiar'); }
  const clamp = (x) => Math.max(0, Math.min(100, Math.round(x)));
  return { pileta: clamp(pileta), jardin: clamp(jardin), motivos };
}

const nivel = (s) => (s >= 75 ? 'ok' : s >= 50 ? 'pronto' : 'vencido');
const etiqueta = (s) => (s >= 75 ? 'Ideal' : s >= 50 ? 'Aceptable' : 'Evitar');

export async function cargarPronostico() {
  const ubic = await getAjuste('ubicacion', { nombre: 'Buenos Aires', lat: -34.61, lon: -58.38 });
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${ubic.lat}&longitude=${ubic.lon}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max' +
    '&hourly=precipitation_probability&past_days=1&forecast_days=16&timezone=auto';
  const r = await fetch(url);
  if (!r.ok) throw new Error('No se pudo obtener el pronóstico');
  const j = await r.json();
  const dd = j.daily;
  const dias = dd.time.map((t, i) => ({
    fecha: t, codigo: dd.weather_code[i], max: dd.temperature_2m_max[i], min: dd.temperature_2m_min[i],
    prob: dd.precipitation_probability_max[i] ?? 0, mm: dd.precipitation_sum[i] ?? 0, viento: dd.wind_speed_10m_max[i] ?? 0, uv: dd.uv_index_max[i],
    lluviaAyer: i > 0 ? dd.precipitation_sum[i - 1] ?? 0 : 0,
    horas: j.hourly.time.map((h, k) => [h, j.hourly.precipitation_probability[k]]).filter(([h]) => h.startsWith(t)),
  }));
  const datos = { ubic, dias: dias.slice(1), actualizado: new Date().toISOString() };
  try { localStorage.setItem('ngp-clima', JSON.stringify(datos)); } catch { /* sin cache */ }
  return datos;
}

export default function Clima() {
  const [datos, setDatos] = useState(() => { try { return JSON.parse(localStorage.getItem('ngp-clima')); } catch { return null; } });
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [busq, setBusq] = useState('');
  const [resultados, setResultados] = useState([]);
  const [abierto, setAbierto] = useState(null);
  const visitas = useLiveQuery(() => db.visitas.where('estado').equals('programada').toArray(), []) || [];
  const clientes = useLiveQuery(() => db.clientes.toArray(), []) || [];
  const cMap = new Map(clientes.map((c) => [c.id, c]));

  const actualizar = async () => {
    setCargando(true); setError('');
    try { setDatos(await cargarPronostico()); } catch (e) { setError(navigator.onLine ? e.message : 'Sin conexión: se muestra el último pronóstico guardado.'); }
    setCargando(false);
  };
  useEffect(() => {
    if (!datos || Date.now() - new Date(datos.actualizado).getTime() > 3 * 3600000) actualizar();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function buscar(e) {
    e.preventDefault();
    if (!busq.trim()) return;
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(busq)}&count=6&language=es`).then((x) => x.json()).catch(() => ({}));
    setResultados(r.results || []);
  }
  async function elegir(u) {
    await setAjuste('ubicacion', u);
    setResultados([]); setBusq('');
    actualizar();
  }
  function gps() {
    navigator.geolocation?.getCurrentPosition(
      (p) => elegir({ nombre: 'Mi ubicación', lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) }),
      () => setError('No se pudo obtener la ubicación.')
    );
  }

  const dias = (datos?.dias || []).map((d, i, arr) => ({ ...d, ev: evaluarDia(d, arr[i + 1]) }));
  const proximos7 = dias.slice(0, 7);
  const mejoresPileta = [...proximos7].sort((a, b) => b.ev.pileta - a.ev.pileta).slice(0, 3);
  const mejoresJardin = [...proximos7].sort((a, b) => b.ev.jardin - a.ev.jardin).slice(0, 3);
  const nombreDia = (f) => {
    const s = new Date(f + 'T12:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  // visitas programadas en días malos → sugerir mover
  const conflictos = visitas
    .map((v) => {
      const f = new Date(v.fecha); const k = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
      const dia = dias.find((d) => d.fecha === k);
      if (!dia) return null;
      const score = v.tipo === 'jardin' ? dia.ev.jardin : v.tipo === 'ambos' ? Math.min(dia.ev.jardin, dia.ev.pileta) : dia.ev.pileta;
      if (score >= 50) return null;
      const alternativas = dias
        .filter((d) => d.fecha !== k && new Date(d.fecha + 'T12:00') > new Date() && Math.abs(new Date(d.fecha + 'T12:00') - f) <= 4 * DIA)
        .map((d) => ({ d, s: v.tipo === 'jardin' ? d.ev.jardin : v.tipo === 'ambos' ? Math.min(d.ev.jardin, d.ev.pileta) : d.ev.pileta }))
        .sort((a, b) => b.s - a.s)[0];
      return { v, dia, score, alternativa: alternativas };
    })
    .filter(Boolean);

  async function moverVisita(v, fechaStr) {
    const f = new Date(v.fecha);
    const [y, m, d] = fechaStr.split('-').map(Number);
    f.setFullYear(y, m - 1, d);
    await db.visitas.update(v.id, { fecha: f.toISOString() });
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>🌦️ Clima y planificación</h1>
          <p className="muted">📍 {datos?.ubic?.nombre || '—'} {datos && `· actualizado ${new Date(datos.actualizado).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}</p>
        </div>
        <div className="acciones">
          <button className="btn" onClick={gps}>📡 Usar mi ubicación</button>
          <button className="btn primary" onClick={actualizar} disabled={cargando}>{cargando ? 'Cargando…' : '🔄 Actualizar'}</button>
        </div>
      </header>

      <form className="filtros" onSubmit={buscar}>
        <input className="buscar" placeholder="Cambiar zona: buscá tu localidad (ej: Pilar, Tigre…)" value={busq} onChange={(e) => setBusq(e.target.value)} />
        <button className="btn">Buscar</button>
      </form>
      {resultados.length > 0 && (
        <ul className="lista card">
          {resultados.map((r) => (
            <li key={r.id} onClick={() => elegir({ nombre: `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}`, lat: r.latitude, lon: r.longitude })}>
              <div><b>{r.name}</b><small>{[r.admin2, r.admin1, r.country].filter(Boolean).join(', ')}</small></div>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="info rojo">{error}</div>}

      {!datos ? <Vacio icono="🌦️">{cargando ? 'Cargando pronóstico…' : 'Sin datos de clima todavía.'}</Vacio> : (
        <>
          <section className="card destacado">
            <h2>🤖 Recomendación para esta semana</h2>
            <div className="grid2">
              <div>
                <h3>🏊 Mejores días para piletas</h3>
                <ol className="ranking">
                  {mejoresPileta.map((d) => <li key={d.fecha}><b>{nombreDia(d.fecha)}</b> <span className={'pill ' + nivel(d.ev.pileta)}>{d.ev.pileta}/100</span> <small className="muted">{WMO[d.codigo]?.[0]} {d.prob}% lluvia</small></li>)}
                </ol>
              </div>
              <div>
                <h3>🌳 Mejores días para jardines</h3>
                <ol className="ranking">
                  {mejoresJardin.map((d) => <li key={d.fecha}><b>{nombreDia(d.fecha)}</b> <span className={'pill ' + nivel(d.ev.jardin)}>{d.ev.jardin}/100</span> <small className="muted">{WMO[d.codigo]?.[0]} {d.prob}% lluvia</small></li>)}
                </ol>
              </div>
            </div>
            <p className="sm muted">Se calcula en tu dispositivo con la probabilidad y los milímetros de lluvia, el viento, la temperatura y la lluvia del día anterior y del siguiente. No se envía nada a terceros.</p>
          </section>

          {conflictos.length > 0 && (
            <section className="card borde-rojo">
              <h2>⚠️ Visitas programadas con mal clima</h2>
              <ul className="lista">
                {conflictos.map(({ v, dia, score, alternativa }) => (
                  <li key={v.id}>
                    <div>
                      <b>{cMap.get(v.clienteId)?.nombre}</b>
                      <small>{nombreDia(dia.fecha)} · {WMO[dia.codigo]?.[0]} {dia.prob}% lluvia · puntaje {score}</small>
                      {alternativa && <small>💡 Mejor: <b>{nombreDia(alternativa.d.fecha)}</b> ({alternativa.s}/100)</small>}
                    </div>
                    {alternativa && <button className="btn sm primary" onClick={() => moverVisita(v, alternativa.d.fecha)}>Mover</button>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2>📆 Pronóstico de 15 días</h2>
            <div className="clima-dias">
              {dias.map((d) => (
                <div key={d.fecha} className={'clima-dia ' + (abierto === d.fecha ? 'abierto' : '')} onClick={() => setAbierto(abierto === d.fecha ? null : d.fecha)}>
                  <div className="clima-top">
                    <div>
                      <b>{nombreDia(d.fecha)}</b>
                      <small className="muted">{WMO[d.codigo]?.[1] || ''}</small>
                    </div>
                    <span className="clima-ico">{WMO[d.codigo]?.[0] || '❔'}</span>
                  </div>
                  <div className="clima-temp">{Math.round(d.max)}° <span className="muted">/ {Math.round(d.min)}°</span></div>
                  <div className="lluvia">
                    <span>💧 {d.prob}%</span>
                    <div className="barra"><div className="barra-in lluvia-in" style={{ width: d.prob + '%' }} /></div>
                    <small className="muted">{d.mm.toFixed(1)} mm · 💨 {Math.round(d.viento)} km/h</small>
                  </div>
                  <div className="clima-scores">
                    <span className={'pill ' + nivel(d.ev.pileta)}>🏊 {etiqueta(d.ev.pileta)}</span>
                    <span className={'pill ' + nivel(d.ev.jardin)}>🌳 {etiqueta(d.ev.jardin)}</span>
                  </div>
                  {abierto === d.fecha && (
                    <div className="clima-detalle">
                      {d.ev.motivos.length ? <ul>{d.ev.motivos.map((m) => <li key={m}>{m}</li>)}</ul> : <p className="sm">Sin contras: buen día para trabajar.</p>}
                      {d.horas.length > 0 && (
                        <div className="horas" title="Probabilidad de lluvia por hora">
                          {d.horas.filter((_, i) => i % 2 === 0).map(([h, p]) => (
                            <div key={h} className="hora"><div className="hora-bar" style={{ height: Math.max(2, p) + '%' }} title={`${h.slice(11, 16)} · ${p}%`} /><small>{h.slice(11, 13)}</small></div>
                          ))}
                        </div>
                      )}
                      {d.uv != null && <p className="sm muted">Índice UV máx: {Math.round(d.uv)} {d.uv >= 8 ? '· usá protector' : ''}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
          <p className="muted sm nota">Datos: Open-Meteo.com (CC BY 4.0). Tocá un día para ver el detalle por hora.</p>
        </>
      )}
    </div>
  );
}
