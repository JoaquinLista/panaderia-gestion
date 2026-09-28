// Formateo de datos para mostrar en pantalla.

export function formatFecha(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function nombreSucursal(sucursales, id) {
  const s = sucursales.find((x) => x.id === Number(id));
  return s ? s.nombre : `#${id}`;
}
