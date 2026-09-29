import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';

import { libroCajaCentral, libroCierres } from '../../src/domain/planillas.js';

// Se arma el archivo, se escribe y se vuelve a abrir, como lo haría Excel.
const abrir = async (libro) => {
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(await libro.xlsx.writeBuffer());
  return leido;
};

/** Filas de una hoja como objetos { encabezado: valor }. */
const filas = (hoja) => {
  const encabezados = hoja.getRow(1).values;
  const resultado = [];
  hoja.eachRow((fila, n) => {
    if (n === 1) return;
    const obj = {};
    fila.values.forEach((v, i) => {
      if (v !== undefined && v !== null) obj[encabezados[i]] = v;
    });
    resultado.push(obj);
  });
  return resultado;
};

const mov = (extra) => ({ concepto: null, saldo_caja: 0, saldo_banco: 0, ...extra });

const MOVIMIENTOS = [
  mov({
    fecha: '2026-09-01',
    tipo: 'SALDO_INICIAL',
    cuenta: 'CAJA',
    monto: 1000000,
    saldo_caja: 1000000,
  }),
  mov({
    fecha: '2026-09-02',
    tipo: 'RETIRO_SUCURSAL',
    cuenta: 'CAJA',
    monto: 98000.5,
    sucursal: 'Estrada',
    turno: 'MEDIODIA',
    saldo_caja: 1098000.5,
  }),
  mov({
    fecha: '2026-09-02',
    tipo: 'DEPOSITO',
    cuenta: 'CAJA',
    monto: 800000,
    saldo_caja: 298000.5,
    saldo_banco: 800000,
  }),
  mov({
    fecha: '2026-09-03',
    tipo: 'PAGO',
    cuenta: 'BANCO',
    monto: 300000,
    categoria: 'Proveedores',
    concepto: 'Harina',
    saldo_caja: 298000.5,
    saldo_banco: 500000,
  }),
  mov({
    fecha: '2026-09-03',
    tipo: 'PAGO',
    cuenta: 'CAJA',
    monto: 50000,
    categoria: 'Obra',
    concepto: 'Cemento',
    saldo_caja: 248000.5,
    saldo_banco: 500000,
  }),
  mov({
    fecha: '2026-09-04',
    tipo: 'RETIRO_DUENO',
    cuenta: 'CAJA',
    monto: 100000,
    dueno_id: 2,
    dueno: 'Gabriel',
    saldo_caja: 148000.5,
    saldo_banco: 500000,
  }),
  mov({
    fecha: '2026-09-05',
    tipo: 'AJUSTE',
    cuenta: 'CAJA',
    monto: -0.5,
    concepto: 'Arqueo',
    saldo_caja: 148000,
    saldo_banco: 500000,
  }),
];

const RESUMEN = {
  entradas_por_sucursal: [{ sucursal_id: 2, sucursal: 'Estrada', total: 98000.5 }],
  total_entradas: 98000.5,
  depositos: 800000,
  retiros_por_dueno: [
    { dueno_id: 1, dueno: 'Fernanda', total: 0 },
    { dueno_id: 2, dueno: 'Gabriel', total: 100000 },
  ],
  total_retiros_duenos: 100000,
  gastos_por_categoria: [
    {
      categoria_id: 6,
      categoria: 'Proveedores',
      en_sucursales: 0,
      en_caja_central: 300000,
      total: 300000,
    },
  ],
  ajustes: -0.5,
  saldo_caja: 148000,
  saldo_banco: 500000,
};

describe('planilla "Retiros" de la caja central', () => {
  it('tiene las columnas de siempre, un dueño por columna y los totales', async () => {
    const libro = await abrir(
      libroCajaCentral({ mes: '2026-09', movimientos: MOVIMIENTOS, resumen: RESUMEN })
    );
    const hoja = libro.getWorksheet('Caja 2026-09');
    expect(hoja.getRow(1).values.slice(1)).toEqual([
      'Fecha',
      'Detalle',
      'Cuenta',
      'Retiro sucursales',
      'Depósitos',
      'Fernanda',
      'Gabriel',
      'Obra',
      'Egresos',
      'Concepto',
      'Ajustes',
      'Saldo caja',
      'Saldo banco',
    ]);
    const [inicial, retiro, deposito, pago, obra, dueno, ajuste, total] = filas(hoja);
    expect(inicial).toMatchObject({
      Detalle: 'Saldo inicial (Caja central)',
      'Saldo caja': 1000000,
    });
    expect(inicial.Fecha).toEqual(new Date(Date.UTC(2026, 8, 1)));
    expect(retiro).toMatchObject({ Detalle: 'Estrada · Mediodía', 'Retiro sucursales': 98000.5 });
    expect(deposito).toMatchObject({ Cuenta: 'Caja → Banco', Depósitos: 800000 });
    expect(pago).toMatchObject({
      Detalle: 'Proveedores',
      Cuenta: 'Banco Patagonia',
      Egresos: 300000,
      Concepto: 'Harina',
    });
    expect(obra).toMatchObject({ Obra: 50000, Concepto: 'Cemento' });
    expect(dueno).toMatchObject({ Detalle: 'Retiro de Gabriel', Gabriel: 100000 });
    expect(ajuste).toMatchObject({ Ajustes: -0.5, Concepto: 'Arqueo' });
    // Los saldos no se suman: ya son acumulados.
    expect(total).toEqual({
      Fecha: 'Total',
      'Retiro sucursales': 98000.5,
      Depósitos: 800000,
      Fernanda: 0,
      Gabriel: 100000,
      Obra: 50000,
      Egresos: 300000,
      Ajustes: -0.5,
    });
    expect(hoja.getCell('I5').numFmt).toBe('#,##0.00');
  });

  it('suma el resumen del mes como "Resumen SOCIOS"', async () => {
    const libro = await abrir(
      libroCajaCentral({ mes: '2026-09', movimientos: MOVIMIENTOS, resumen: RESUMEN })
    );
    const valores = [];
    libro.getWorksheet('Resumen').eachRow((fila) => valores.push(fila.values.slice(1)));
    expect(valores).toEqual(
      expect.arrayContaining([
        ['Resumen de 2026-09'],
        ['Estrada', 98000.5],
        ['Gabriel', 100000],
        ['Depositado en el banco', 800000],
        ['Proveedores', 0, 300000, 300000],
        ['Caja central', 148000],
        ['Banco Patagonia', 500000],
      ])
    );
  });

  it('un mes sin movimientos sólo tiene encabezado y totales en cero', async () => {
    const libro = await abrir(
      libroCajaCentral({
        mes: '2026-10',
        movimientos: [],
        resumen: { ...RESUMEN, entradas_por_sucursal: [], gastos_por_categoria: [] },
      })
    );
    const [total] = filas(libro.getWorksheet('Caja 2026-10'));
    expect(total).toMatchObject({ Fecha: 'Total', 'Retiro sucursales': 0, Egresos: 0 });
  });
});

const cierre = (extra) => ({
  sucursal_nombre: 'Estrada',
  numero_z: null,
  total_controlador: 100000,
  efectivo_contado: 60000.5,
  cambio_fijo: 10000,
  debito: 20000,
  credito: 10000,
  qr: 5000,
  diferencia: 0,
  comentario: null,
  gastos: [],
  ...extra,
});

describe('planilla "Egresos de caja"', () => {
  it('una fila por cierre, en orden, con una columna por categoría', async () => {
    const libro = await abrir(
      libroCierres({
        categorias: [
          { id: 1, nombre: 'Personal' },
          { id: 10, nombre: 'Varios' },
        ],
        cierres: [
          cierre({
            fecha: '2026-09-02',
            turno: 'NOCHE',
            numero_z: 1532,
            gastos: [
              { categoria_id: 10, categoria: 'Varios', monto: 4000 },
              { categoria_id: 10, categoria: 'Varios', monto: 499.5 },
              { categoria_id: 11, categoria: 'Hielo', monto: 1000 },
            ],
            diferencia: -500,
            comentario: 'Faltó',
          }),
          cierre({ fecha: '2026-09-02', turno: 'MEDIODIA' }),
          cierre({ fecha: '2026-09-01', turno: 'NOCHE', sucursal_nombre: 'Café' }),
        ],
      })
    );
    const hoja = libro.getWorksheet('Egresos de caja');
    expect(hoja.getRow(1).values.slice(1)).toEqual([
      'Fecha',
      'Sucursal',
      'Turno',
      'Z',
      'Total Z',
      'Efectivo contado',
      'Cambio',
      'Retiro',
      'Débito',
      'Crédito',
      'QR',
      'Personal',
      'Varios',
      'Hielo',
      'Total gastos',
      'Diferencia',
      'Comentario',
    ]);
    const [cafe, mediodia, noche, total] = filas(hoja);
    expect(cafe).toMatchObject({ Sucursal: 'Café', Turno: 'Noche' });
    expect(mediodia).toMatchObject({ Turno: 'Mediodía', Retiro: 50000.5, 'Total gastos': 0 });
    expect(noche).toMatchObject({
      Turno: 'Noche',
      Z: 1532,
      Varios: 4499.5,
      Hielo: 1000,
      'Total gastos': 5499.5,
      Diferencia: -500,
      Comentario: 'Faltó',
    });
    expect(total).toMatchObject({
      Fecha: 'Total',
      Retiro: 150001.5,
      Débito: 60000,
      Varios: 4499.5,
      'Total gastos': 5499.5,
      Diferencia: -500,
    });
  });
});
