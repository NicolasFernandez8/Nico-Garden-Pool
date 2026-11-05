import { useEffect, useState } from 'react';
import { db, estadoProductos, getAjuste } from './db';
import { notificar } from './utils';
import Inicio from './pages/Inicio';
import Clientes from './pages/Clientes';
import ClienteDetalle from './pages/ClienteDetalle';
import Piletas from './pages/Piletas';
import Visitas from './pages/Visitas';
import Galeria from './pages/Galeria';
import Caja from './pages/Caja';
import Inventario from './pages/Inventario';
import Referidos from './pages/Referidos';
import Ajustes from './pages/Ajustes';
import Clima from './pages/Clima';
import Prospectos from './pages/Prospectos';
import { Tema } from './components/Tema';

export const NAV_GRUPOS = { inicio: 'General', clientes: 'Operación', caja: 'Administración', ajustes: 'Sistema' };
export const NAV = [
  { id: 'inicio', label: 'Inicio', ico: '🏠' },
  { id: 'clientes', label: 'Clientes', ico: '👥' },
  { id: 'piletas', label: 'Productos', ico: '🧪' },
  { id: 'visitas', label: 'Agenda', ico: '📅' },
  { id: 'clima', label: 'Clima', ico: '🌦️' },
  { id: 'galeria', label: 'Galería', ico: '📸' },
  { id: 'caja', label: 'Caja', ico: '💰' },
  { id: 'inventario', label: 'Inventario', ico: '🧰' },
  { id: 'referidos', label: 'Referidos', ico: '🤝' },
  { id: 'prospectos', label: 'Prospectos', ico: '🎯' },
  { id: 'ajustes', label: 'Ajustes', ico: '⚙️' },
];
const MOVIL = ['inicio', 'clientes', 'piletas', 'visitas', 'caja'];

function leerRuta() {
  const [page, id] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { page: page || 'inicio', id: id ? Number(id) : null };
}

// Chequeo de vencimientos y aviso
async function chequearAlertas() {
  const horas = Number(await getAjuste('avisoHorasAntes', 24));
  const estados = await estadoProductos();
  let avisados = {};
  try { avisados = JSON.parse(localStorage.getItem('ngp-avisados') || '{}'); } catch { /* vacío */ }
  const now = Date.now();
  const clientes = new Map((await db.clientes.toArray()).map((c) => [c.id, c]));
  const productos = new Map((await db.productos.toArray()).map((p) => [p.id, p]));
  for (const a of estados) {
    const c = clientes.get(a.clienteId);
    if (!c || c.activo === false || a.desactivado) continue;
    const t = new Date(a.proxima).getTime();
    const p = productos.get(a.productoId);
    const nombre = `${p?.icono || ''} ${p?.nombre || 'Producto'}`.trim();
    if (t < now && !avisados[a.id + '-v']) {
      avisados[a.id + '-v'] = now;
      await notificar(`⚠️ Vencido: ${nombre}`, `${c.nombre} — hay que volver a colocarlo.`);
    } else if (t >= now && t - now < horas * 3600000 && !avisados[a.id + '-p']) {
      avisados[a.id + '-p'] = now;
      const hs = Math.round((t - now) / 3600000);
      await notificar(`⏰ Pronto: ${nombre}`, `${c.nombre} — faltan ~${hs} h para reponer.`);
    }
  }
  localStorage.setItem('ngp-avisados', JSON.stringify(avisados));
}

export default function App() {
  const [ruta, setRuta] = useState(leerRuta());
  const [mas, setMas] = useState(false);

  useEffect(() => {
    const f = () => { setRuta(leerRuta()); setMas(false); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  useEffect(() => {
    chequearAlertas().catch(console.error);
    const t = setInterval(() => chequearAlertas().catch(console.error), 60000);
    return () => clearInterval(t);
  }, []);

  const { page, id } = ruta;
  let vista;
  switch (page) {
    case 'clientes': vista = <Clientes />; break;
    case 'cliente': vista = <ClienteDetalle id={id} />; break;
    case 'piletas': vista = <Piletas />; break;
    case 'visitas': vista = <Visitas />; break;
    case 'galeria': vista = <Galeria clienteId={id} />; break;
    case 'caja': vista = <Caja />; break;
    case 'inventario': vista = <Inventario />; break;
    case 'referidos': vista = <Referidos />; break;
    case 'ajustes': vista = <Ajustes />; break;
    case 'clima': vista = <Clima />; break;
    case 'prospectos': vista = <Prospectos />; break;
    default: vista = <Inicio />;
  }
  const activo = page === 'cliente' ? 'clientes' : page;
  const actual = NAV.find((n) => n.id === activo) || NAV[0];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img src="icon.svg" alt="" />
          <div>
            <b>Nico Garden &amp; Pool</b>
            <span>gestión de mantenimientos</span>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <div key={n.id}>
              {NAV_GRUPOS[n.id] && <div className="nav-grupo">{NAV_GRUPOS[n.id]}</div>}
              <a href={'#/' + n.id} className={activo === n.id ? 'on' : ''}>
                <span className="ico">{n.ico}</span>
                {n.label}
              </a>
            </div>
          ))}
        </nav>
        <div className="side-foot">Uso interno · datos en este dispositivo</div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="migas">
            <img src="icon.svg" alt="" className="migas-logo" />
            <span className="muted">Nico Garden &amp; Pool</span>
            <span className="muted">›</span>
            <b>{actual.label}</b>
          </div>
          <Tema />
        </div>
        <main className="contenido">{vista}</main>
      </div>

      <nav className="bottomnav">
        {NAV.filter((n) => MOVIL.includes(n.id)).map((n) => (
          <a key={n.id} href={'#/' + n.id} className={activo === n.id ? 'on' : ''}>
            <span className="ico">{n.ico}</span>
            <small>{n.label}</small>
          </a>
        ))}
        <button className={!MOVIL.includes(activo) ? 'on' : ''} onClick={() => setMas(!mas)}>
          <span className="ico">☰</span>
          <small>Más</small>
        </button>
      </nav>
      {mas && (
        <div className="mas-bg" onClick={() => setMas(false)}>
          <div className="mas" onClick={(e) => e.stopPropagation()}>
            {NAV.filter((n) => !MOVIL.includes(n.id)).map((n) => (
              <a key={n.id} href={'#/' + n.id}>
                <span className="ico">{n.ico}</span>
                {n.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
