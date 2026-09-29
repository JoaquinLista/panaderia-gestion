import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ReportarProblema from './ReportarProblema.jsx';

let enviados;

beforeEach(() => {
  enviados = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, opciones) => {
      enviados.push({ url, cuerpo: JSON.parse(opciones.body) });
      if (url === '/api/reportes') {
        return { ok: true, status: 201, json: async () => ({ id: 12, issue_url: null }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Reportar un problema', () => {
  it('manda lo que pasó con la sección y la versión, y agradece', async () => {
    const user = userEvent.setup();
    render(<ReportarProblema seccion="Cierre de caja" alVolver={() => {}} />);
    await user.type(screen.getByLabelText('¿Qué pasó?'), 'Apreté Guardar y no pasó nada');
    await user.type(screen.getByLabelText(/Qué esperabas/), 'Que se guarde');
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    expect(await screen.findByRole('status')).toHaveTextContent('¡Gracias! Lo recibimos.');
    expect(screen.getByText(/reporte número 12/)).toBeInTheDocument();
    expect(enviados).toEqual([
      {
        url: '/api/reportes',
        cuerpo: {
          que_paso: 'Apreté Guardar y no pasó nada',
          esperado: 'Que se guarde',
          seccion: 'Cierre de caja',
          version: 'local',
        },
      },
    ]);
  });

  it('pide un poco más de texto antes de mandar', async () => {
    const user = userEvent.setup();
    render(<ReportarProblema seccion="Resumen" alVolver={() => {}} />);
    await user.type(screen.getByLabelText('¿Qué pasó?'), 'no anda');
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/al menos 10 letras/);
    expect(enviados).toEqual([]);
  });

  it('muestra el error de la API', async () => {
    fetch.mockImplementationOnce(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Ya mandaste muchos reportes. Probá de nuevo en un rato.' }),
    }));
    const user = userEvent.setup();
    render(<ReportarProblema seccion="Resumen" alVolver={() => {}} />);
    await user.type(screen.getByLabelText('¿Qué pasó?'), 'El Excel sale vacío siempre');
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/muchos reportes/);
  });

  it('Cancelar y Volver llevan a la sección de antes', async () => {
    const user = userEvent.setup();
    const alVolver = vi.fn();
    render(<ReportarProblema seccion="Resumen" alVolver={alVolver} />);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.type(screen.getByLabelText('¿Qué pasó?'), 'El Excel sale vacío siempre');
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    await user.click(await screen.findByRole('button', { name: 'Volver a Resumen' }));
    expect(alVolver).toHaveBeenCalledTimes(2);
  });
});
