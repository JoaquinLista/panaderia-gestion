// Textos y cuentas de la caja central que usa la pantalla.
import { centavosDe, TURNOS } from './cierres.js';

export const CUENTAS = { CAJA: 'Caja central', BANCO: 'Banco Patagonia' };

/** Tipos que carga la dueña, en el orden en que se ofrecen. */
export const TIPOS = [
  ['DEPOSITO', 'Depósito al banco'],
  ['PAGO', 'Pago'],
  ['RETIRO_DUENO', 'Retiro de un dueño'],
  ['AJUSTE', 'Ajuste de arqueo'],
  ['SALDO_INICIAL', 'Saldo inicial'],
];

const NOMBRE_TIPO = Object.fromEntries(TIPOS);

/** Lo que dice cada fila de la lista, como se anotaría en la planilla. */
export const describir = (m) => {
  switch (m.tipo) {
    case 'RETIRO_SUCURSAL':
      return `${m.sucursal} · ${TURNOS[m.turno] ?? m.turno}`;
    case 'PAGO':
      return `${m.categoria} · ${m.concepto}`;
    case 'RETIRO_DUENO':
      return m.concepto ? `Retiro de ${m.dueno} · ${m.concepto}` : `Retiro de ${m.dueno}`;
    case 'AJUSTE':
      return `Ajuste · ${m.concepto}`;
    default:
      return m.concepto ? `${NOMBRE_TIPO[m.tipo]} · ${m.concepto}` : NOMBRE_TIPO[m.tipo];
  }
};

/**
 * Cómo mueve la plata una fila, para mostrarla con su signo: entra (+),
 * sale (−) o pasa de una cuenta a otra (el depósito).
 * @returns {{ centavos: number, cuenta: string }}
 */
export const movimientoDe = (m) => {
  const centavos = centavosDe(m.monto);
  switch (m.tipo) {
    case 'RETIRO_SUCURSAL':
      return { centavos, cuenta: CUENTAS.CAJA };
    case 'DEPOSITO':
      return { centavos: 0, cuenta: `${CUENTAS.CAJA} → ${CUENTAS.BANCO}` };
    case 'PAGO':
    case 'RETIRO_DUENO':
      return { centavos: -centavos, cuenta: CUENTAS[m.cuenta] };
    default:
      return { centavos, cuenta: CUENTAS[m.cuenta] };
  }
};

/** "2026-09" → "septiembre de 2026" */
export const nombreMes = (mes) => {
  const [anio, numero] = mes.split('-').map(Number);
  return new Date(Date.UTC(anio, numero - 1, 1)).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

/** Primer y último día del mes (AAAA-MM). */
export const rangoDelMes = (mes) => {
  const [anio, numero] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(anio, numero, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` };
};
