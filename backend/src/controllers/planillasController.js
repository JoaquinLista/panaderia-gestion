import { TIPO_XLSX } from '../domain/planillas.js';
import { excelCajaCentral, excelCierres, excelResumen } from '../services/planillasService.js';

const enviar = async (res, { nombre, libro }) => {
  const archivo = await libro.xlsx.writeBuffer();
  res.setHeader('Content-Type', TIPO_XLSX);
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.send(Buffer.from(archivo));
};

/** GET /api/caja-central/excel[?mes=AAAA-MM]: planilla "Retiros" del mes. */
export const getExcelCajaCentral = async (req, res, next) => {
  try {
    await enviar(res, await excelCajaCentral(req.query.mes));
  } catch (error) {
    next(error);
  }
};

/** GET /api/cierres/excel?sucursal_id=&desde=&hasta=: planilla "Egresos de caja". */
export const getExcelCierres = async (req, res, next) => {
  try {
    await enviar(res, await excelCierres(req.query));
  } catch (error) {
    next(error);
  }
};

/** GET /api/dashboard/excel[?mes=AAAA-MM]: resumen del mes de los dueños. */
export const getExcelResumen = async (req, res, next) => {
  try {
    await enviar(res, await excelResumen(req.query.mes));
  } catch (error) {
    next(error);
  }
};
