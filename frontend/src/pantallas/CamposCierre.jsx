// Piezas que comparten la carga del cierre y la revisión de la dueña.
import { X } from 'lucide-react';

import { centavosDe } from '../lib/cierres.js';
import { formatearMonto, leerMonto, mostrarPesos } from '../lib/cuadre.js';

/** Texto y color de la diferencia, en palabras de la caja. */
export function Diferencia({ centavos, aviso }) {
  if (centavos === 0) {
    return (
      <div className="cuadre cuadre-ok" role="status">
        <strong>Sin diferencia</strong>
        <span>Coincide con el controlador</span>
      </div>
    );
  }
  const texto = centavos < 0 ? 'Faltan' : 'Sobran';
  return (
    <div className="cuadre cuadre-mal" role="status">
      <strong>
        {texto} {mostrarPesos(Math.abs(centavos))}
      </strong>
      {aviso && <span>{aviso}</span>}
    </div>
  );
}

/** Etiqueta corta del resultado de un cierre. */
export function BadgeDiferencia({ diferencia }) {
  const centavos = centavosDe(diferencia);
  if (centavos === 0) return <span className="badge badge-ok">SIN DIFERENCIA</span>;
  return (
    <span className="badge badge-warn">
      {centavos < 0 ? 'FALTAN' : 'SOBRAN'} {mostrarPesos(Math.abs(centavos))}
    </span>
  );
}

/**
 * Campo de monto: teclado numérico en el celular, puntos de miles mientras se
 * escribe y aviso si no se entiende. `onChange` recibe el texto ya formateado.
 */
export function CampoMonto({ id, label, valor, onChange, ayuda }) {
  const invalido = leerMonto(valor) === null;
  return (
    <div className="campo-monto">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={valor}
        onChange={(e) => onChange(formatearMonto(e.target.value))}
        aria-invalid={invalido}
        aria-describedby={ayuda || invalido ? `${id}-ayuda` : undefined}
      />
      {(invalido || ayuda) && (
        <p id={`${id}-ayuda`} className={invalido ? 'campo-error' : 'ayuda'}>
          {invalido ? 'No se entiende el monto. Ejemplo: 12.500,50' : ayuda}
        </p>
      )}
    </div>
  );
}

/**
 * Un gasto pagado con la caja: categoría (como las columnas de la planilla),
 * detalle y monto. `onCambiar(campo)` devuelve el handler de cada control.
 */
export function FilaGasto({ numero, gasto, categorias, onCambiar, onQuitar }) {
  const guardada =
    gasto.categoria_id !== '' && !categorias.some((c) => String(c.id) === gasto.categoria_id);
  return (
    <div className="gasto-row">
      <select
        aria-label={`Categoría del gasto ${numero}`}
        value={gasto.categoria_id}
        onChange={onCambiar('categoria_id')}
      >
        <option value="">Categoría…</option>
        {categorias.map((c) => (
          <option key={c.id} value={String(c.id)}>
            {c.nombre}
          </option>
        ))}
        {guardada && <option value={gasto.categoria_id}>{gasto.categoria}</option>}
      </select>
      <input
        aria-label={`Detalle del gasto ${numero}`}
        placeholder="Ej: sodero"
        value={gasto.detalle}
        onChange={onCambiar('detalle')}
      />
      <input
        aria-label={`Monto del gasto ${numero}`}
        inputMode="decimal"
        placeholder="0"
        value={gasto.monto}
        aria-invalid={leerMonto(gasto.monto) === null}
        onChange={onCambiar('monto')}
      />
      <button type="button" aria-label={`Quitar gasto ${numero}`} onClick={onQuitar}>
        <X size={20} strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  );
}
