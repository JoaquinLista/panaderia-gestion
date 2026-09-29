import { describe, it, expect } from 'vitest';

import {
  mesAnterior,
  periodos,
  resumirDia,
  totalesDelPeriodo,
  variacion,
  ventasDeCierre,
  ventasDelMes,
} from '../../src/domain/dashboard.js';

// Montos en centavos, como los usa el dominio.
const cierre = (extra) => ({
  sucursal_id: 2,
  fecha: '2026-09-10',
  turno: 'MEDIODIA',
  total_controlador: 100000,
  efectivo_contado: 60000,
  cambio_fijo: 10000,
  debito: 30000,
  credito: 10000,
  qr: 5000,
  gastos: 5000,
  diferencia: 0,
  ...extra,
});

const SUCURSALES = [
  { id: 2, nombre: 'Estrada' },
  { id: 3, nombre: 'Café' },
];

describe('ventasDeCierre', () => {
  it('el efectivo vendido suma los gastos pagados con la plata de la caja', () => {
    expect(ventasDeCierre(cierre())).toEqual({
      vendido: 100000,
      efectivo: 55000, // 600 − 100 de cambio + 50 de gastos
      debito: 30000,
      credito: 10000,
      qr: 5000,
      gastos: 5000,
    });
  });
});

describe('resumirDia', () => {
  it('suma los dos turnos de cada sucursal y marca los que faltan', () => {
    const r = resumirDia({
      fecha: '2026-09-10',
      sucursales: SUCURSALES,
      cierres: [
        cierre({ turno: 'MEDIODIA', diferencia: -500 }),
        cierre({ turno: 'NOCHE', total_controlador: 200000, debito: 130000 }),
      ],
    });
    const [estrada, cafe] = r.sucursales;
    expect(estrada).toMatchObject({
      sucursal: 'Estrada',
      vendido: 300000,
      debito: 160000,
      diferencia: -500,
      turnos_cargados: ['MEDIODIA', 'NOCHE'],
      turnos_pendientes: [],
    });
    expect(cafe).toMatchObject({ vendido: 0, turnos_pendientes: ['MEDIODIA', 'NOCHE'] });
    expect(r.total.vendido).toBe(300000);
    expect(r.total).not.toHaveProperty('diferencia');
    expect(r.turnos_pendientes).toBe(2);
  });
});

describe('periodos', () => {
  it('en el mes en curso compara del 1 a hoy contra los mismos días del anterior', () => {
    expect(periodos('2026-09', '2026-09-18')).toEqual({
      actual: { mes: '2026-09', desde: '2026-09-01', hasta: '2026-09-18', en_curso: true },
      anterior: { mes: '2026-08', desde: '2026-08-01', hasta: '2026-08-18' },
    });
  });

  it('si hoy es 31 y el mes anterior tiene 30 días, compara hasta el 30', () => {
    expect(periodos('2026-10', '2026-10-31').anterior.hasta).toBe('2026-09-30');
    expect(periodos('2026-03', '2026-03-30').anterior.hasta).toBe('2026-02-28');
  });

  it('un mes terminado se compara entero contra el anterior entero', () => {
    expect(periodos('2026-08', '2026-09-18')).toEqual({
      actual: { mes: '2026-08', desde: '2026-08-01', hasta: '2026-08-31', en_curso: false },
      anterior: { mes: '2026-07', desde: '2026-07-01', hasta: '2026-07-31' },
    });
  });

  it('un mes que todavía no empezó no tiene período', () => {
    expect(periodos('2026-10', '2026-09-18')).toBeNull();
  });
});

describe('mesAnterior', () => {
  it('enero vuelve a diciembre del año anterior', () => {
    expect(mesAnterior('2027-01')).toBe('2026-12');
    expect(mesAnterior('2026-10')).toBe('2026-09');
  });
});

describe('variacion', () => {
  it('es el porcentaje de cambio con un decimal', () => {
    expect(variacion(115000, 100000)).toBe(15);
    expect(variacion(2, 3)).toBe(-33.3);
  });

  it('contra un resultado negativo, mejorar da positivo', () => {
    expect(variacion(-5000, -10000)).toBe(50);
  });

  it('sin nada antes no hay porcentaje', () => {
    expect(variacion(1000, 0)).toBeNull();
  });
});

describe('totalesDelPeriodo', () => {
  it('resultado = ventas − gastos (sucursales, caja central y obra) − retiros', () => {
    const t = totalesDelPeriodo({
      cierres: [cierre(), cierre({ turno: 'NOCHE', gastos: 0 })],
      pagos: [
        { monto: 30000, obra: false },
        { monto: 20000, obra: true },
      ],
      retiros: [{ monto: 40000 }],
    });
    expect(t).toEqual({
      ventas: 200000,
      medios: { efectivo: 105000, debito: 60000, credito: 20000, qr: 10000 },
      gastos: { sucursales: 5000, caja_central: 30000, obra: 20000, total: 55000 },
      retiros_duenos: 40000,
      resultado: 105000,
    });
  });

  it('sin datos da todo cero', () => {
    expect(totalesDelPeriodo({ cierres: [], pagos: [], retiros: [] }).resultado).toBe(0);
  });
});

describe('ventasDelMes', () => {
  it('una fila por día con cada sucursal, y los turnos sin cargar', () => {
    const v = ventasDelMes({
      desde: '2026-09-01',
      hasta: '2026-09-03',
      sucursales: SUCURSALES,
      cierres: [
        cierre({ fecha: '2026-09-01' }),
        cierre({ fecha: '2026-09-03', sucursal_id: 3, total_controlador: 50000 }),
      ],
    });
    expect(v.por_dia.map((d) => d.fecha)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(v.por_dia[0]).toEqual({
      fecha: '2026-09-01',
      vendido: 100000,
      por_sucursal: { 2: 100000, 3: 0 },
    });
    expect(v.por_dia[1].vendido).toBe(0);
    expect(v.por_sucursal).toEqual([
      { sucursal_id: 2, sucursal: 'Estrada', vendido: 100000, cierres: 1, turnos_sin_cargar: 5 },
      { sucursal_id: 3, sucursal: 'Café', vendido: 50000, cierres: 1, turnos_sin_cargar: 5 },
    ]);
  });
});
