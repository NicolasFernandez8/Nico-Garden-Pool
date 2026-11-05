import Dexie from 'dexie';

export const db = new Dexie('nico-garden-pool');

db.version(1).stores({
  clientes: '++id, nombre, servicio, activo, referidoPor',
  productos: '++id, nombre',
  aplicaciones: '++id, clienteId, productoId, fecha, proxima',
  visitas: '++id, clienteId, fecha, estado',
  fotos: '++id, clienteId, tipo, etapa, fecha',
  movimientos: '++id, tipo, fecha, clienteId, categoria',
  herramientas: '++id, nombre, estado',
  insumos: '++id, nombre',
  prospectos: '++id, estado, referidoPor',
  ajustes: 'clave',
});

const PRODUCTOS_BASE = [
  { nombre: 'Boya / pastilla de cloro', intervaloDias: 7, unidad: 'u', icono: '🛟' },
  { nombre: 'Cloro líquido', intervaloDias: 3, unidad: 'L', icono: '🧪' },
  { nombre: 'Cloro granulado (shock)', intervaloDias: 15, unidad: 'kg', icono: '⚡' },
  { nombre: 'Clarificador', intervaloDias: 7, unidad: 'L', icono: '💧' },
  { nombre: 'Alguicida', intervaloDias: 15, unidad: 'L', icono: '🌿' },
  { nombre: 'Regulador de pH', intervaloDias: 7, unidad: 'kg', icono: '⚖️' },
];

const HERRAMIENTAS_BASE = [
  { nombre: 'Barrefondo', estado: 'tengo', cantidad: 1, costo: 0, prioridad: 'media', categoria: 'Pileta' },
  { nombre: 'Saca hojas', estado: 'tengo', cantidad: 1, costo: 0, prioridad: 'media', categoria: 'Pileta' },
  { nombre: 'Kit medidor pH / cloro', estado: 'tengo', cantidad: 1, costo: 0, prioridad: 'alta', categoria: 'Pileta' },
  { nombre: 'Cortadora de césped', estado: 'tengo', cantidad: 1, costo: 0, prioridad: 'alta', categoria: 'Jardín' },
  { nombre: 'Bordeadora', estado: 'tengo', cantidad: 1, costo: 0, prioridad: 'alta', categoria: 'Jardín' },
  { nombre: 'Sopladora', estado: 'falta', cantidad: 1, costo: 0, prioridad: 'media', categoria: 'Jardín' },
];

db.on('populate', async () => {
  await db.productos.bulkAdd(PRODUCTOS_BASE);
  await db.herramientas.bulkAdd(HERRAMIENTAS_BASE);
  await db.insumos.bulkAdd([
    { nombre: 'Cloro líquido', stock: 0, minimo: 20, unidad: 'L' },
    { nombre: 'Pastillas de cloro', stock: 0, minimo: 10, unidad: 'u' },
    { nombre: 'Nafta / mezcla', stock: 0, minimo: 5, unidad: 'L' },
  ]);
  await db.ajustes.bulkAdd([
    { clave: 'avisoHorasAntes', valor: 24 },
    { clave: 'beneficioReferido', valor: '10% de descuento en el próximo mes' },
  ]);
});

export async function getAjuste(clave, porDefecto) {
  const r = await db.ajustes.get(clave);
  return r ? r.valor : porDefecto;
}
export function setAjuste(clave, valor) {
  return db.ajustes.put({ clave, valor });
}

/** Última aplicación de cada (cliente, producto) => estado actual */
export async function estadoProductos() {
  const apps = await db.aplicaciones.orderBy('fecha').toArray();
  const map = new Map();
  for (const a of apps) map.set(`${a.clienteId}-${a.productoId}`, a);
  return [...map.values()];
}

// ---------- Respaldo ----------
const blobToDataURL = (b) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(b);
  });
const dataURLToBlob = async (u) => (await fetch(u)).blob();

export async function exportarTodo() {
  const out = { app: 'Nico Garden & Pool', version: 1, fecha: new Date().toISOString(), tablas: {} };
  for (const t of db.tables) {
    let rows = await t.toArray();
    if (t.name === 'fotos') {
      rows = await Promise.all(
        rows.map(async (f) => ({ ...f, blob: f.blob ? await blobToDataURL(f.blob) : null, thumb: f.thumb ? await blobToDataURL(f.thumb) : null }))
      );
    }
    out.tablas[t.name] = rows;
  }
  return out;
}

export async function importarTodo(data) {
  if (!data || !data.tablas) throw new Error('Archivo de respaldo inválido');
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  for (const t of db.tables) {
    let rows = data.tablas[t.name] || [];
    if (t.name === 'fotos') {
      rows = await Promise.all(
        rows.map(async (f) => ({ ...f, blob: f.blob ? await dataURLToBlob(f.blob) : null, thumb: f.thumb ? await dataURLToBlob(f.thumb) : null }))
      );
    }
    await t.bulkAdd(rows);
  }
}
