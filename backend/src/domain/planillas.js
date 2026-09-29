/**
 * Planillas de Excel con las columnas que la familia ya usa: "Retiros" para la
 * caja central y "Egresos de caja" para los cierres. Reciben los datos ya
 * calculados por los servicios y sólo arman el archivo.
 */
import ExcelJS from 'exceljs';

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const PESOS = '#,##0.00';
const TURNOS = { MEDIODIA: 'Mediodía', NOCHE: 'Noche' };
const CUENTAS = { CAJA: 'Caja central', BANCO: 'Banco Patagonia' };

// Plata en centavos enteros para sumar sin errores; a pesos al escribirla.
const centavos = (pesos) => Math.round(Number(pesos) * 100);
const aPesos = (c) => c / 100;

/** "2026-09-29" → fecha de Excel (sin hora ni zona horaria). */
const aFecha = (texto) => {
  const [anio, mes, dia] = texto.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia));
};

const libroNuevo = () => {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'La Fueguina Stats';
  return libro;
};

/**
 * Hoja con encabezado en negrita, fijo al bajar, y columnas de plata con
 * formato de pesos. `columnas`: [{ header, key, width, plata? }].
 */
const hojaConColumnas = (libro, nombre, columnas) => {
  const hoja = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = columnas.map(({ header, key, width }) => ({ header, key, width }));
  hoja.getRow(1).font = { bold: true };
  for (const c of columnas) {
    if (c.plata) hoja.getColumn(c.key).numFmt = PESOS;
    if (c.fecha) hoja.getColumn(c.key).numFmt = 'dd/mm/yyyy';
  }
  return hoja;
};

/** Fila de totales: suma, en centavos, cada columna de plata. */
const agregarTotales = (hoja, columnas, filas) => {
  const total = { [columnas[0].key]: 'Total' };
  for (const c of columnas.filter((x) => x.plata && x.sumar !== false)) {
    total[c.key] = aPesos(filas.reduce((suma, f) => suma + centavos(f[c.key] ?? 0), 0));
  }
  hoja.addRow(total).font = { bold: true };
};

const DETALLE = {
  DEPOSITO: () => 'Depósito al banco',
  SALDO_INICIAL: (m) => `Saldo inicial (${CUENTAS[m.cuenta]})`,
  RETIRO_DUENO: (m) => `Retiro de ${m.dueno}`,
  AJUSTE: () => 'Ajuste de arqueo',
  PAGO: (m) => m.categoria,
  RETIRO_SUCURSAL: (m) => `${m.sucursal} · ${TURNOS[m.turno] ?? m.turno}`,
};

/**
 * Planilla "Retiros" de un mes: una fila por movimiento con las columnas de
 * siempre (retiro de sucursales, depósitos, un dueño por columna, obra,
 * egresos) y el saldo, más una hoja con el resumen del mes.
 * @param {{ mes: string, movimientos: object[], resumen: object }} datos
 *   lo que devuelven listarMovimientos y resumenMensual
 */
export const libroCajaCentral = ({ mes, movimientos, resumen }) => {
  const libro = libroNuevo();
  const duenos = resumen.retiros_por_dueno.map((d) => ({ id: d.dueno_id, nombre: d.dueno }));
  const columnas = [
    { header: 'Fecha', key: 'fecha', width: 12, fecha: true },
    { header: 'Detalle', key: 'detalle', width: 28 },
    { header: 'Cuenta', key: 'cuenta', width: 16 },
    { header: 'Retiro sucursales', key: 'retiro', width: 16, plata: true },
    { header: 'Depósitos', key: 'deposito', width: 14, plata: true },
    ...duenos.map((d) => ({ header: d.nombre, key: `dueno_${d.id}`, width: 14, plata: true })),
    { header: 'Obra', key: 'obra', width: 14, plata: true },
    { header: 'Egresos', key: 'egresos', width: 14, plata: true },
    { header: 'Concepto', key: 'concepto', width: 32 },
    { header: 'Ajustes', key: 'ajuste', width: 12, plata: true },
    { header: 'Saldo caja', key: 'saldo_caja', width: 16, plata: true, sumar: false },
    { header: 'Saldo banco', key: 'saldo_banco', width: 16, plata: true, sumar: false },
  ];
  const hoja = hojaConColumnas(libro, `Caja ${mes}`, columnas);

  const filas = movimientos.map((m) => {
    const fila = {
      fecha: aFecha(m.fecha),
      detalle: DETALLE[m.tipo](m),
      cuenta: m.tipo === 'DEPOSITO' ? 'Caja → Banco' : CUENTAS[m.cuenta],
      concepto: m.concepto ?? undefined,
      saldo_caja: m.saldo_caja,
      saldo_banco: m.saldo_banco,
    };
    if (m.tipo === 'RETIRO_SUCURSAL') fila.retiro = m.monto;
    if (m.tipo === 'DEPOSITO') fila.deposito = m.monto;
    if (m.tipo === 'RETIRO_DUENO') fila[`dueno_${m.dueno_id}`] = m.monto;
    if (m.tipo === 'PAGO') fila[m.categoria === 'Obra' ? 'obra' : 'egresos'] = m.monto;
    if (m.tipo === 'AJUSTE') fila.ajuste = m.monto;
    return fila;
  });
  hoja.addRows(filas);
  agregarTotales(hoja, columnas, filas);

  // ---- Resumen del mes, como "Resumen SOCIOS" ----
  const r = libro.addWorksheet('Resumen');
  r.columns = [
    { key: 'a', width: 34 },
    { key: 'b', width: 16 },
    { key: 'c', width: 16 },
    { key: 'd', width: 16 },
  ];
  const titulo = (texto) => {
    r.addRow([]);
    r.addRow([texto]).font = { bold: true };
  };
  r.addRow([`Resumen de ${mes}`]).font = { bold: true, size: 13 };

  titulo('Entró de las sucursales');
  for (const s of resumen.entradas_por_sucursal) r.addRow([s.sucursal, s.total]);
  r.addRow(['Total', resumen.total_entradas]).font = { bold: true };

  titulo('Retiros de los dueños');
  for (const d of resumen.retiros_por_dueno) r.addRow([d.dueno, d.total]);
  r.addRow(['Total', resumen.total_retiros_duenos]).font = { bold: true };

  titulo('Movimientos del mes');
  r.addRow(['Depositado en el banco', resumen.depositos]);
  r.addRow(['Ajustes de arqueo', resumen.ajustes]);

  titulo('Gastos por categoría');
  r.addRow(['Categoría', 'Sucursales', 'Caja central', 'Total']).font = { bold: true };
  for (const k of resumen.gastos_por_categoria) {
    r.addRow([k.categoria, k.en_sucursales, k.en_caja_central, k.total]);
  }

  titulo('Saldo al final del mes');
  r.addRow(['Caja central', resumen.saldo_caja]);
  r.addRow(['Banco Patagonia', resumen.saldo_banco]);

  for (const col of ['b', 'c', 'd']) r.getColumn(col).numFmt = PESOS;
  return libro;
};

/**
 * Planilla "Egresos de caja": una fila por cierre con los medios de cobro, el
 * retiro, una columna por categoría de gasto y la diferencia.
 * @param {{ cierres: object[], categorias: { id: number, nombre: string }[] }} datos
 */
export const libroCierres = ({ cierres, categorias }) => {
  const libro = libroNuevo();
  // Las categorías activas, más las que ya no se usan pero aparecen en estos cierres.
  const todas = [...categorias];
  for (const g of cierres.flatMap((c) => c.gastos)) {
    if (!todas.some((k) => k.id === g.categoria_id)) {
      todas.push({ id: g.categoria_id, nombre: g.categoria });
    }
  }
  const columnas = [
    { header: 'Fecha', key: 'fecha', width: 12, fecha: true },
    { header: 'Sucursal', key: 'sucursal', width: 18 },
    { header: 'Turno', key: 'turno', width: 10 },
    { header: 'Z', key: 'numero_z', width: 8 },
    { header: 'Total Z', key: 'total_controlador', width: 14, plata: true },
    { header: 'Efectivo contado', key: 'efectivo_contado', width: 16, plata: true },
    { header: 'Cambio', key: 'cambio_fijo', width: 12, plata: true },
    { header: 'Retiro', key: 'retiro', width: 14, plata: true },
    { header: 'Débito', key: 'debito', width: 14, plata: true },
    { header: 'Crédito', key: 'credito', width: 14, plata: true },
    { header: 'QR', key: 'qr', width: 14, plata: true },
    ...todas.map((k) => ({ header: k.nombre, key: `cat_${k.id}`, width: 14, plata: true })),
    { header: 'Total gastos', key: 'gastos', width: 14, plata: true },
    { header: 'Diferencia', key: 'diferencia', width: 12, plata: true },
    { header: 'Comentario', key: 'comentario', width: 30 },
  ];
  const hoja = hojaConColumnas(libro, 'Egresos de caja', columnas);

  const ordenados = [...cierres].sort(
    (a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      a.sucursal_nombre.localeCompare(b.sucursal_nombre) ||
      Object.keys(TURNOS).indexOf(a.turno) - Object.keys(TURNOS).indexOf(b.turno)
  );
  const filas = ordenados.map((c) => {
    const fila = {
      fecha: aFecha(c.fecha),
      sucursal: c.sucursal_nombre,
      turno: TURNOS[c.turno],
      numero_z: c.numero_z ?? undefined,
      total_controlador: c.total_controlador,
      efectivo_contado: c.efectivo_contado,
      cambio_fijo: c.cambio_fijo,
      retiro: aPesos(centavos(c.efectivo_contado) - centavos(c.cambio_fijo)),
      debito: c.debito,
      credito: c.credito,
      qr: c.qr,
      gastos: aPesos(c.gastos.reduce((s, g) => s + centavos(g.monto), 0)),
      diferencia: c.diferencia,
      comentario: c.comentario ?? undefined,
    };
    for (const g of c.gastos) {
      const clave = `cat_${g.categoria_id}`;
      fila[clave] = aPesos(centavos(fila[clave] ?? 0) + centavos(g.monto));
    }
    return fila;
  });
  hoja.addRows(filas);
  agregarTotales(hoja, columnas, filas);
  return libro;
};

const MEDIOS = { efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', qr: 'QR' };

/** Variación en % (15.3) → fracción para el formato de porcentaje de Excel. */
const aFraccion = (v) => (v === null ? 'sin datos' : v / 100);

/**
 * Resumen del mes para los dueños: los números de la pantalla "Resumen"
 * comparados con los mismos días del mes anterior, y las ventas de cada día
 * por sucursal.
 * @param {object} resumen lo que devuelve resumenDelMes
 */
export const libroResumenMes = (resumen) => {
  const libro = libroNuevo();
  const { anterior } = resumen;

  // ---- Hoja "Resumen" ----
  const r = libro.addWorksheet('Resumen');
  r.columns = [
    { key: 'a', width: 34 },
    { key: 'b', width: 16 },
    { key: 'c', width: 16 },
    { key: 'd', width: 12 },
  ];
  for (const col of ['b', 'c']) r.getColumn(col).numFmt = PESOS;
  const titulo = (texto) => {
    r.addRow([]);
    r.addRow([texto]).font = { bold: true };
  };
  r.addRow([`Resumen de ${resumen.mes}`]).font = { bold: true, size: 13 };
  const f = (texto) => texto.split('-').reverse().join('/');
  r.addRow([
    `Del ${f(resumen.desde)} al ${f(resumen.hasta)}, comparado con ${f(anterior.desde)} al ${f(anterior.hasta)}`,
  ]);

  titulo('Números del mes');
  r.addRow(['', 'Este mes', 'Mes anterior', 'Variación']).font = { bold: true };
  const conVariacion = (nombre, actual, antes, v) => {
    const fila = r.addRow([nombre, actual, antes, aFraccion(v)]);
    fila.getCell('d').numFmt = '+0.0%;-0.0%;0.0%';
    return fila;
  };
  conVariacion('Ventas', resumen.ventas, anterior.ventas, resumen.variacion.ventas);
  r.addRow(['Gastos de las sucursales', resumen.gastos.sucursales, anterior.gastos.sucursales]);
  r.addRow(['Pagos de la caja central', resumen.gastos.caja_central, anterior.gastos.caja_central]);
  r.addRow(['Obra', resumen.gastos.obra, anterior.gastos.obra]);
  conVariacion(
    'Total de gastos',
    resumen.gastos.total,
    anterior.gastos.total,
    resumen.variacion.gastos
  );
  conVariacion(
    'Retiros de los dueños',
    resumen.retiros_duenos,
    anterior.retiros_duenos,
    resumen.variacion.retiros_duenos
  );
  conVariacion(
    'Resultado',
    resumen.resultado,
    anterior.resultado,
    resumen.variacion.resultado
  ).font = { bold: true };
  r.addRow(['Resultado = ventas − gastos − retiros de los dueños. Los depósitos no cuentan.']);

  titulo('Ventas por medio de pago');
  for (const [clave, nombre] of Object.entries(MEDIOS)) {
    r.addRow([nombre, resumen.medios[clave], anterior.medios[clave]]);
  }

  titulo('Ventas por sucursal');
  r.addRow(['Sucursal', 'Vendido', 'Cierres', 'Turnos sin cargar']).font = { bold: true };
  for (const s of resumen.ventas_por_sucursal) {
    // Cierres y turnos son cantidades, no plata.
    r.addRow([s.sucursal, s.vendido, s.cierres, s.turnos_sin_cargar]).getCell('c').numFmt = '0';
  }

  titulo('Retiros de los dueños');
  for (const d of resumen.retiros_por_dueno) r.addRow([d.dueno, d.total]);

  // ---- Hoja "Ventas por día" ----
  const sucursales = resumen.ventas_por_sucursal;
  const columnas = [
    { header: 'Fecha', key: 'fecha', width: 12, fecha: true },
    ...sucursales.map((s) => ({
      header: s.sucursal,
      key: `suc_${s.sucursal_id}`,
      width: 16,
      plata: true,
    })),
    { header: 'Total', key: 'total', width: 16, plata: true },
  ];
  const hoja = hojaConColumnas(libro, 'Ventas por día', columnas);
  const filas = resumen.ventas_por_dia.map((d) => ({
    fecha: aFecha(d.fecha),
    ...Object.fromEntries(
      sucursales.map((s) => [`suc_${s.sucursal_id}`, d.por_sucursal[s.sucursal_id] ?? 0])
    ),
    total: d.vendido,
  }));
  hoja.addRows(filas);
  agregarTotales(hoja, columnas, filas);
  return libro;
};
