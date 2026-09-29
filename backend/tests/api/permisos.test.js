import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { crearUsuarios, responderConsultas, PASSWORD } from '../helpers/baseFalsa.js';

// QA de seguridad (T9): login real con la cookie, sin atajos. La base es falsa:
// las consultas del login van a tablas en memoria y el resto devuelve vacío.
vi.mock('../../src/config/db.js', () => {
  const query = vi.fn();
  return { default: { query }, query, getClient: vi.fn() };
});

const db = await import('../../src/config/db.js');
const { default: app } = await import('../../src/app.js');
const { intentosLogin } = await import('../../src/middlewares/limiteLogin.js');

let usuarios;
let consultasDeNegocio;

const cookies = {};

beforeAll(async () => {
  usuarios = await crearUsuarios();
});

beforeEach(async () => {
  vi.clearAllMocks();
  intentosLogin.resetAll();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  consultasDeNegocio = [];
  const login = responderConsultas({ usuarios });
  db.query.mockImplementation(async (sql, params) => {
    if (/FROM usuarios WHERE (lower|id)|FROM sucursales WHERE id/.test(sql)) {
      return login(sql, params);
    }
    consultasDeNegocio.push({ sql, params });
    return { rows: [], rowCount: 0 };
  });
  db.getClient.mockRejectedValue(new Error('fin de la prueba'));

  const entrar = async (body) => {
    const res = await request(app).post('/api/auth/login').send(body);
    return res.headers['set-cookie'].find((c) => c.startsWith('sesion='));
  };
  cookies.admin = await entrar({ usuario: 'dueña', password: PASSWORD });
  cookies.empleada = await entrar({ usuario: 'lucia', password: PASSWORD, sucursalId: 3 });
  cookies.chofer = await entrar({ usuario: 'marcos', password: PASSWORD });
  cookies.empleadaSinCaja = await entrar({ usuario: 'sofia', password: PASSWORD, sucursalId: 3 });
  consultasDeNegocio = [];
});

const RUTAS_PROTEGIDAS = [
  ['get', '/api/productos'],
  ['get', '/api/insumos'],
  ['post', '/api/insumos'],
  ['get', '/api/pedidos'],
  ['post', '/api/pedidos'],
  ['put', '/api/pedidos/1/estado'],
  ['get', '/api/usuarios'],
  ['post', '/api/usuarios'],
  ['patch', '/api/usuarios/2'],
  ['put', '/api/usuarios/2/password'],
  ['get', '/api/cierres/hoy'],
  ['post', '/api/cierres'],
  ['get', '/api/cierres'],
  ['get', '/api/cierres/pendientes'],
  ['get', '/api/cierres/1'],
  ['put', '/api/cierres/1'],
  ['put', '/api/cierres/1/revisado'],
];

describe('sin sesión', () => {
  it.each(RUTAS_PROTEGIDAS)('%s %s responde 401 y no toca la base', async (metodo, ruta) => {
    const res = await request(app)[metodo](ruta).send({});
    expect(res.status).toBe(401);
    expect(consultasDeNegocio).toEqual([]);
  });

  it('la lista de sucursales es pública: la usa la pantalla de login', async () => {
    const res = await request(app).get('/api/sucursales');
    expect(res.status).toBe(200);
  });
});

describe('rol incorrecto: 403', () => {
  it.each([
    ['empleada', 'get', '/api/insumos'],
    ['empleada', 'post', '/api/insumos'],
    ['empleada', 'put', '/api/pedidos/1/estado'],
    ['empleada', 'get', '/api/usuarios'],
    ['empleada', 'put', '/api/usuarios/2/password'],
    ['chofer', 'post', '/api/pedidos'],
    ['chofer', 'get', '/api/usuarios'],
    ['chofer', 'patch', '/api/usuarios/3'],
    ['chofer', 'get', '/api/cierres/hoy'],
    ['chofer', 'post', '/api/cierres'],
    // Cerrar caja es un permiso que la dueña da a cada empleada.
    ['empleadaSinCaja', 'get', '/api/cierres/hoy'],
    ['empleadaSinCaja', 'post', '/api/cierres'],
    // Revisar y corregir cierres es sólo de la dueña: ni la empleada que cierra puede.
    ['empleada', 'get', '/api/cierres'],
    ['empleada', 'get', '/api/cierres/pendientes'],
    ['empleada', 'get', '/api/cierres/1'],
    ['empleada', 'put', '/api/cierres/1'],
    ['empleada', 'put', '/api/cierres/1/revisado'],
    ['chofer', 'get', '/api/cierres'],
    // La caja central son los números del negocio: sólo los dueños.
    ['empleada', 'get', '/api/caja-central/resumen'],
    ['empleada', 'post', '/api/caja-central/movimientos'],
    ['chofer', 'get', '/api/caja-central/movimientos'],
    ['chofer', 'delete', '/api/caja-central/movimientos/1'],
    ['empleada', 'get', '/api/caja-central/excel'],
    ['empleada', 'get', '/api/cierres/excel'],
    ['empleada', 'get', '/api/dashboard/excel'],
    // El resumen de ventas y resultado es de los dueños.
    ['empleada', 'get', '/api/dashboard/dia'],
    ['chofer', 'get', '/api/dashboard/mes'],
  ])('%s: %s %s', async (quien, metodo, ruta) => {
    const res = await request(app)[metodo](ruta).set('Cookie', cookies[quien]).send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('No tenés permiso para hacer esto');
    expect(consultasDeNegocio).toEqual([]);
  });

  it.each([
    ['admin', 'get', '/api/usuarios'],
    ['chofer', 'get', '/api/insumos'],
    ['chofer', 'get', '/api/pedidos'],
    ['empleada', 'get', '/api/productos'],
    ['empleada', 'get', '/api/cierres/hoy'],
  ])('%s sí puede %s %s', async (quien, metodo, ruta) => {
    const res = await request(app)[metodo](ruta).set('Cookie', cookies[quien]);
    expect(res.status).toBe(200);
  });
});

describe('la empleada y su sucursal del día', () => {
  it('sólo ve los pedidos que salen de su sucursal o llegan a ella', async () => {
    await request(app).get('/api/pedidos').set('Cookie', cookies.empleada);
    const [{ sql, params }] = consultasDeNegocio;
    expect(sql).toMatch(/WHERE p\.sucursal_origen_id = \$1 OR p\.sucursal_destino_id = \$1/);
    expect(params).toEqual([3]);
  });

  it('admin y chofer ven todos los pedidos', async () => {
    for (const quien of ['admin', 'chofer']) {
      consultasDeNegocio = [];
      await request(app).get('/api/pedidos').set('Cookie', cookies[quien]);
      expect(consultasDeNegocio[0].sql).not.toMatch(/WHERE/);
    }
  });

  const pedido = (origen) => ({
    sucursal_origen_id: origen,
    sucursal_destino_id: 1,
    detalles: [{ producto_id: 1, cantidad: 2 }],
  });

  it('no puede crear un pedido desde otra sucursal', async () => {
    const res = await request(app)
      .post('/api/pedidos')
      .set('Cookie', cookies.empleada)
      .send(pedido(2));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Sólo podés crear pedidos desde tu sucursal del día (Estrada)');
  });

  it('sí puede crear un pedido desde su sucursal', async () => {
    const res = await request(app)
      .post('/api/pedidos')
      .set('Cookie', cookies.empleada)
      .send(pedido(3));
    // Pasa los permisos y llega a la base (que en esta prueba corta con un error).
    expect(res.status).toBe(500);
    expect(db.getClient).toHaveBeenCalled();
  });

  it('el admin puede crear pedidos desde cualquier sucursal', async () => {
    const res = await request(app)
      .post('/api/pedidos')
      .set('Cookie', cookies.admin)
      .send(pedido(2));
    expect(res.status).not.toBe(403);
  });
});

describe('sesiones cortadas', () => {
  it('un usuario desactivado no puede entrar', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'ex-empleada', password: PASSWORD, sucursalId: 3 });
    expect(res.status).toBe(401);
  });

  it('un token emitido antes del reseteo de contraseña ya no vale', async () => {
    const antes = Math.floor(new Date('2025-12-31T23:00:00Z').getTime() / 1000);
    const token = jwt.sign({ suc: null, iat: antes }, process.env.JWT_SECRET, {
      subject: '1',
      expiresIn: '100y',
    });
    const res = await request(app).get('/api/productos').set('Cookie', `sesion=${token}`);
    expect(res.status).toBe(401);
  });
});
