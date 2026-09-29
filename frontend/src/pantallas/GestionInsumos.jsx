import { useCallback, useEffect, useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';

import { apiGet, apiPost } from '../lib/api.js';

export default function GestionInsumos() {
  const [insumos, setInsumos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [nombre, setNombre] = useState('');
  const [stockActual, setStockActual] = useState('');
  const [stockMinimo, setStockMinimo] = useState('');
  const [unidad, setUnidad] = useState('kg');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const data = await apiGet('/insumos');
      setInsumos(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const bajoStock = useMemo(
    () => insumos.filter((i) => i.bajo_stock ?? Number(i.stock_actual) < Number(i.stock_minimo)),
    [insumos]
  );

  const elegirInsumo = (i) => {
    setNombre(i.nombre);
    setStockActual(String(Number(i.stock_actual)));
    setStockMinimo(String(Number(i.stock_minimo)));
    setUnidad(i.unidad_medida || 'kg');
    setOkMsg('');
    setError('');
  };

  const limpiar = () => {
    setNombre('');
    setStockActual('');
    setStockMinimo('');
    setUnidad('kg');
  };

  const enviar = async (evt) => {
    evt.preventDefault();
    setError('');
    setOkMsg('');

    if (!nombre.trim()) {
      setError('El nombre del insumo es obligatorio.');
      return;
    }
    if (stockActual === '' || Number(stockActual) < 0 || Number.isNaN(Number(stockActual))) {
      setError('Ingresá un stock actual válido (numérico, no negativo).');
      return;
    }

    const payload = {
      nombre: nombre.trim(),
      stock_actual: Number(stockActual),
      unidad_medida: unidad.trim() || 'unidad',
    };
    if (stockMinimo !== '' && !Number.isNaN(Number(stockMinimo))) {
      payload.stock_minimo = Number(stockMinimo);
    }

    setEnviando(true);
    try {
      await apiPost('/insumos', payload);
      setOkMsg('Insumo guardado correctamente.');
      limpiar();
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid-2">
      <div className="card">
        <h2>Cargar / actualizar insumo</h2>
        <p className="subtitle">
          Si el nombre ya existe se actualiza su stock; si no, se crea uno nuevo.
        </p>

        {error && <div className="alert alert-error">{error}</div>}
        {okMsg && <div className="alert alert-ok">{okMsg}</div>}

        <form onSubmit={enviar}>
          <label htmlFor="ins-nombre">Nombre</label>
          <input
            id="ins-nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Harina 000"
            required
          />

          <label htmlFor="ins-stock">Stock actual</label>
          <input
            id="ins-stock"
            type="number"
            min="0"
            step="0.01"
            value={stockActual}
            onChange={(e) => setStockActual(e.target.value)}
            required
          />

          <label htmlFor="ins-min">Stock mínimo</label>
          <input
            id="ins-min"
            type="number"
            min="0"
            step="0.01"
            value={stockMinimo}
            onChange={(e) => setStockMinimo(e.target.value)}
            placeholder="Opcional"
          />

          <label htmlFor="ins-unidad">Unidad de medida</label>
          <input
            id="ins-unidad"
            type="text"
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
            placeholder="kg, l, unidad…"
          />

          <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
            <button type="submit" className="primary" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar insumo'}
            </button>
            <button type="button" className="link" onClick={limpiar}>
              Limpiar
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="row-between">
          <div>
            <h2>Insumos en stock</h2>
            <p className="subtitle">
              {insumos.length} insumo(s) · {bajoStock.length} bajo el mínimo
            </p>
          </div>
          <button className="link" onClick={cargar}>
            Actualizar
          </button>
        </div>

        {bajoStock.length > 0 && (
          <div className="alert alert-error alert-con-icono">
            <TriangleAlert size={22} strokeWidth={2.5} aria-hidden="true" />
            {bajoStock.length} insumo(s) por debajo del stock mínimo:{' '}
            {bajoStock.map((i) => i.nombre).join(', ')}.
          </div>
        )}

        {cargando ? (
          <div className="empty">Cargando insumos…</div>
        ) : insumos.length === 0 ? (
          <div className="empty">No hay insumos cargados.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Stock actual</th>
                  <th>Stock mínimo</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {insumos.map((i) => {
                  const bajo = i.bajo_stock ?? Number(i.stock_actual) < Number(i.stock_minimo);
                  return (
                    <tr key={i.id}>
                      <td>{i.nombre}</td>
                      <td>
                        {Number(i.stock_actual)} {i.unidad_medida}
                      </td>
                      <td>
                        {Number(i.stock_minimo)} {i.unidad_medida}
                      </td>
                      <td>
                        {bajo ? (
                          <span className="badge badge-danger">BAJO STOCK</span>
                        ) : (
                          <span className="badge badge-ok">OK</span>
                        )}
                      </td>
                      <td>
                        <button className="link" onClick={() => elegirInsumo(i)}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
