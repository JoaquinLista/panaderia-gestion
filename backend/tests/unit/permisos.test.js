import { describe, it, expect } from 'vitest';

import { ACCIONES, permisosDe, puede } from '../../src/domain/permisos.js';

const admin = { rol: 'ADMIN' };
const empleada = { rol: 'EMPLEADA' };
const encargada = { rol: 'EMPLEADA', puedeCerrarCaja: true };
const chofer = { rol: 'CHOFER' };

describe('matriz de permisos', () => {
  it('el admin puede hacer todo', () => {
    expect(permisosDe(admin)).toEqual(Object.values(ACCIONES));
  });

  it.each([
    [ACCIONES.VER_SUCURSALES, true, true, true],
    [ACCIONES.VER_PRODUCTOS, true, true, true],
    [ACCIONES.VER_INSUMOS, true, false, true],
    [ACCIONES.CARGAR_INSUMOS, true, false, true],
    [ACCIONES.VER_PEDIDOS, true, true, true],
    [ACCIONES.CREAR_PEDIDO, true, true, false],
    [ACCIONES.CAMBIAR_ESTADO_PEDIDO, true, false, true],
    [ACCIONES.CERRAR_CAJA, true, false, false],
    [ACCIONES.ADMINISTRAR_USUARIOS, true, false, false],
    [ACCIONES.ADMINISTRAR_CAJA_CENTRAL, true, false, false],
    [ACCIONES.ADMINISTRAR_RUBROS, true, false, false],
  ])('%s → admin %s, empleada %s, chofer %s', (accion, esAdmin, esEmpleada, esChofer) => {
    expect(puede(admin, accion)).toBe(esAdmin);
    expect(puede(empleada, accion)).toBe(esEmpleada);
    expect(puede(chofer, accion)).toBe(esChofer);
  });

  it('una empleada cierra caja sólo si la dueña le dio el permiso', () => {
    expect(puede(encargada, ACCIONES.CERRAR_CAJA)).toBe(true);
    expect(puede(empleada, ACCIONES.CERRAR_CAJA)).toBe(false);
  });

  it('el permiso de caja no se le suma al chofer', () => {
    expect(puede({ rol: 'CHOFER', puedeCerrarCaja: true }, ACCIONES.CERRAR_CAJA)).toBe(false);
  });

  it('un rol desconocido no puede nada', () => {
    expect(permisosDe({ rol: 'GALPON' })).toEqual([]);
  });
});
