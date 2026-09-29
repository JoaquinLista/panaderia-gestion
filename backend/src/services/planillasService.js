import { libroCajaCentral, libroCierres } from '../domain/planillas.js';
import { hoyEnArgentina, rangoDelMes } from '../domain/fecha.js';
import { listarMovimientos, resumenMensual } from './cajaCentralService.js';
import { listarCategorias, listarCierres } from './cierresService.js';

const errorHttp = (status, mensaje) => Object.assign(new Error(mensaje), { status });

/**
 * Excel de la caja central de un mes, como la planilla "Retiros".
 * @param {string} [mes] AAAA-MM; el actual si no viene
 * @param {Date} [ahora]
 * @returns {Promise<{ nombre: string, libro: import('exceljs').Workbook }>}
 */
export const excelCajaCentral = async (mes, ahora = new Date()) => {
  const elegido = mes ?? hoyEnArgentina(ahora).slice(0, 7);
  const rango = rangoDelMes(elegido);
  if (!rango) throw errorHttp(400, '"mes" tiene que tener el formato AAAA-MM');
  const [{ movimientos }, resumen] = await Promise.all([
    listarMovimientos(rango, ahora),
    resumenMensual(elegido, ahora),
  ]);
  return {
    nombre: `caja-central-${elegido}.xlsx`,
    libro: libroCajaCentral({ mes: elegido, movimientos, resumen }),
  };
};

/**
 * Excel de los cierres, como la planilla "Egresos de caja". Usa los mismos
 * filtros que la revisión; sin fechas, el mes en curso.
 * @param {{ sucursal_id?: string, desde?: string, hasta?: string }} filtros
 * @param {Date} [ahora]
 */
export const excelCierres = async (filtros = {}, ahora = new Date()) => {
  const hoy = hoyEnArgentina(ahora);
  const desde = filtros.desde || (filtros.hasta ?? hoy).slice(0, 8) + '01';
  const hasta = filtros.hasta || hoy;
  const [cierres, categorias] = await Promise.all([
    listarCierres({ sucursal_id: filtros.sucursal_id, desde, hasta }, { limite: null }),
    listarCategorias(),
  ]);
  return {
    nombre: `egresos-de-caja-${desde}-a-${hasta}.xlsx`,
    libro: libroCierres({ cierres, categorias }),
  };
};
