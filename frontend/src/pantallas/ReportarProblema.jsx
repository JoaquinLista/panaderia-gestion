import { useState } from 'react';
import { CircleCheck } from 'lucide-react';

import { apiPost } from '../lib/api.js';
import { VERSION } from '../lib/version.js';

const MINIMO = 10;

/**
 * "Reportar un problema" (Sprint 8, #18): cualquier persona cuenta qué le
 * pasó con sus palabras. Se guarda y, si está configurado, se abre un issue
 * en GitHub con la plantilla de bug. La sección y la versión van solas.
 * @param {{ seccion?: string, alVolver: () => void }} props
 */
export default function ReportarProblema({ seccion, alVolver }) {
  const [quePaso, setQuePaso] = useState('');
  const [esperado, setEsperado] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(null);

  const enviar = async (evt) => {
    evt.preventDefault();
    setError('');
    if (quePaso.trim().length < MINIMO) {
      setError(`Contanos un poco más qué pasó (al menos ${MINIMO} letras).`);
      return;
    }
    setEnviando(true);
    try {
      setEnviado(
        await apiPost('/reportes', {
          que_paso: quePaso,
          esperado,
          seccion,
          version: VERSION,
        })
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <section className="card reportar">
        <h2>Reportar un problema</h2>
        <div className="estado estado-ok" role="status">
          <p className="estado-titulo">
            <CircleCheck size={26} strokeWidth={2.5} aria-hidden="true" />
            <strong>¡Gracias! Lo recibimos.</strong>
          </p>
          <p>Es el reporte número {enviado.id}. El equipo lo va a revisar.</p>
        </div>
        <button type="button" className="boton-principal" onClick={alVolver}>
          Volver{seccion ? ` a ${seccion}` : ''}
        </button>
      </section>
    );
  }

  return (
    <section className="card reportar">
      <h2>Reportar un problema</h2>
      <p className="subtitle">Contanos con tus palabras qué no anduvo. No escribas contraseñas.</p>
      <form onSubmit={enviar} aria-label="Reportar un problema" noValidate>
        <label htmlFor="reporte-que-paso">¿Qué pasó?</label>
        <textarea
          id="reporte-que-paso"
          rows={5}
          maxLength={2000}
          value={quePaso}
          onChange={(e) => setQuePaso(e.target.value)}
          placeholder="Por ejemplo: apreté Guardar en el cierre y no pasó nada."
        />
        <label htmlFor="reporte-esperado">¿Qué esperabas que pasara? (opcional)</label>
        <textarea
          id="reporte-esperado"
          rows={3}
          maxLength={2000}
          value={esperado}
          onChange={(e) => setEsperado(e.target.value)}
        />
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <div className="reportar-acciones">
          <button type="submit" className="boton-principal" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar reporte'}
          </button>
          <button type="button" className="link" onClick={alVolver}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}
