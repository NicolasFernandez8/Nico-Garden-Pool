# Nico Garden & Pool

App de **gestión interna** para el servicio de mantenimiento de piletas y jardines. Es 100 % gratuita, funciona sin conexión y anda en **Android** (APK o app instalada desde Chrome) y en **escritorio** (Chrome o Edge en Windows, Mac o Linux).

## Secciones

| Sección | Qué hace |
|---|---|
| 🏠 **Inicio** | Tablero con productos vencidos o por vencer, visitas de hoy y atrasadas, avance de mantenimientos del mes, cobros pendientes, caja del mes e inventario |
| 👥 **Clientes** | Planilla con nombre, teléfono, dirección, enlace a Maps, referencias, servicio, mantenimientos por mes, abono, días de visita y quién lo refirió. Busca, filtra, exporta e importa CSV (Excel/Sheets). Botones directos a Maps, WhatsApp y llamada |
| 🧪 **Productos** | Registro de boya, cloro, clarificador, etc. Calcula cuándo reponer y muestra la **cuenta regresiva en tiempo real**. Avisa con notificaciones. Catálogo editable de productos e intervalos, pausa por cliente y descuento automático de stock |
| 📅 **Agenda** | Visitas programadas, repetición automática, atrasadas, marcar como hecha con pH, cloro, tareas y cobro en el momento. Aviso al cliente por WhatsApp |
| 🌦️ **Clima** | Pronóstico de 15 días con probabilidad de lluvia (también por hora), recomendación de los mejores días para piletas y para jardines, y aviso de visitas programadas en días malos con opción de moverlas |
| 📸 **Galería** | Fotos del antes y el después por cliente (pileta o jardín), comparador deslizable, cámara directa y compresión automática |
| 💰 **Caja** | Ingresos y egresos por categoría y cliente. Gráficos diario, semanal (8 semanas) y mensual (12 meses), balance y margen, egresos por categoría y exportación CSV |
| 🧰 **Inventario** | Herramientas que tenemos, las que faltan comprar, las que hay que reparar y las prestadas. Lista de compras con presupuesto y stock de insumos con mínimo |
| 🤝 **Referidos** | Quién recomendó a quién, ranking, beneficios por dar, embudo de contactos referidos (de nuevo a ganado) y pedido de recomendaciones por WhatsApp |
| ⚙️ **Ajustes** | Anticipación de los avisos, permisos, respaldo completo con fotos para descargar o restaurar, y borrado total |

## Cómo se usa

- **Web / PC:** abrí `https://nicolasfernandez8.github.io/nico-garden-pool/` en Chrome o Edge y tocá "Instalar".
- **Android:** descargá el APK desde **Releases** (o desde Actions → *Generar APK Android* → Artifacts) e instalalo. En la versión APK los avisos de productos llegan **aunque la app esté cerrada**.

> Los datos se guardan **solo en el dispositivo** (IndexedDB). Para pasar datos entre el celular y la PC usá *Ajustes → Respaldo*.

## Desarrollo

```bash
npm install
npm run dev
```

Tecnologías: React + Vite, Dexie (IndexedDB), Chart.js, PWA (Workbox), Capacitor (Android) y Open-Meteo (clima, gratuito y sin clave).
