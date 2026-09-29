// Piezas que comparten la carga del cierre y la revisión de la dueña.
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
