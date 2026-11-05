import { useEffect, useState } from 'react';
import { db, exportarTodo, getAjuste, importarTodo, setAjuste } from '../db';
import { Campo } from '../components/ui';
import { descargar, esNativo, notificar, pedirPermisoNotificaciones, permisoNotificaciones } from '../utils';

export default function Ajustes() {
  const [horas, setHoras] = useState(24);
  const [permiso, setPermiso] = useState(permisoNotificaciones());
  const [msg, setMsg] = useState('');
  const [uso, setUso] = useState(null);
  const [persistente, setPersistente] = useState(null);

  useEffect(() => {
    getAjuste('avisoHorasAntes', 24).then(setHoras);
    navigator.storage?.estimate?.().then(setUso);
    navigator.storage?.persisted?.().then(setPersistente);
  }, []);

  async function exportar() {
    setMsg('Generando respaldo…');
    const data = await exportarTodo();
    descargar(`respaldo-nico-garden-pool-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json');
    await setAjuste('ultimoRespaldo', new Date().toISOString());
    setMsg('✅ Respaldo descargado. Guardalo en Google Drive o en la compu.');
  }
  async function importar(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!window.confirm('Restaurar un respaldo REEMPLAZA todos los datos actuales. ¿Seguir?')) return;
    try {
      setMsg('Restaurando…');
      await importarTodo(JSON.parse(await f.text()));
      setMsg('✅ Respaldo restaurado.');
    } catch (err) {
      setMsg('❌ ' + err.message);
    }
  }
  async function borrarTodo() {
    if (!window.confirm('¿Borrar TODOS los datos de la app?')) return;
    if (window.prompt('Escribí BORRAR para confirmar') !== 'BORRAR') return;
    await db.delete();
    ['ngp-avisados', 'ngp-clima'].forEach((k) => localStorage.removeItem(k));
    location.hash = '#/inicio';
    location.reload();
  }

  return (
    <div className="page">
      <header className="page-head"><h1>⚙️ Ajustes</h1></header>

      <section className="card">
        <h2>🔔 Avisos</h2>
        <div className="form">
          <Campo label="Avisar cuántas horas antes de que venza un producto">
            <input type="number" min="1" value={horas} onChange={(e) => setHoras(e.target.value)} onBlur={() => setAjuste('avisoHorasAntes', Number(horas) || 24)} />
          </Campo>
          <div className="campo">
            <span>Permiso de notificaciones</span>
            <div className="fila-acc">
              <span className={'pill ' + (permiso === 'granted' || permiso === 'nativo' ? 'ok' : 'vencido')}>{permiso === 'granted' || permiso === 'nativo' ? 'Activadas' : permiso === 'denied' ? 'Bloqueadas' : permiso === 'no-soportado' ? 'No soportadas' : 'Sin activar'}</span>
              <button className="btn sm" onClick={async () => { await pedirPermisoNotificaciones(); setPermiso(permisoNotificaciones()); }}>Activar</button>
              <button className="btn sm" onClick={() => notificar('Nico Garden & Pool', '🔔 Así te van a llegar los avisos.')}>Probar</button>
            </div>
          </div>
        </div>
        <p className="muted sm">
          {esNativo()
            ? 'En la app de Android los avisos quedan programados y llegan aunque la app esté cerrada.'
            : 'En la versión web los avisos llegan mientras la app está abierta o en segundo plano. Para recibirlos con la app cerrada usá el APK de Android.'}
        </p>
      </section>

      <section className="card">
        <h2>💾 Respaldo de datos</h2>
        <p className="muted sm">Los datos se guardan solo en este dispositivo. Descargá un respaldo seguido (incluye fotos) y restauralo en otro equipo para pasar la información.</p>
        <div className="acciones">
          <button className="btn primary" onClick={exportar}>⬇️ Descargar respaldo</button>
          <label className="btn">⬆️ Restaurar respaldo<input type="file" accept="application/json,.json" hidden onChange={importar} /></label>
        </div>
        {msg && <p className="info">{msg}</p>}
        <p className="muted sm">
          {uso ? `Espacio usado: ${(uso.usage / 1048576).toFixed(1)} MB de ${(uso.quota / 1048576 / 1024).toFixed(1)} GB disponibles. ` : ''}
          {persistente === false && (
            <button className="link" onClick={async () => setPersistente(await navigator.storage.persist())}>Proteger datos para que el navegador no los borre</button>
          )}
          {persistente && 'Almacenamiento protegido ✅'}
        </p>
      </section>

      <section className="card">
        <h2>📲 Instalar la app</h2>
        <ul className="pasos">
          <li><b>Android:</b> instalá el APK de la sección <i>Releases</i> del repositorio, o en Chrome tocá ⋮ → “Instalar aplicación”.</li>
          <li><b>PC (Windows/Mac/Linux):</b> abrí la app en Chrome o Edge y hacé clic en el ícono de instalar en la barra de direcciones.</li>
          <li><b>iPhone:</b> Safari → Compartir → “Agregar a inicio”.</li>
        </ul>
      </section>

      <section className="card borde-rojo">
        <h2>⚠️ Zona peligrosa</h2>
        <button className="btn ghost rojo" onClick={borrarTodo}>🗑️ Borrar todos los datos</button>
      </section>
      <p className="muted sm nota">Nico Garden & Pool · v1.0 · gestión interna</p>
    </div>
  );
}
