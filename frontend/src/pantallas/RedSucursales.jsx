export default function RedSucursales({ sucursales }) {
  const deposito = sucursales.filter((s) => s.tipo === 'DEPOSITO');
  const fabricas = sucursales.filter((s) => s.tipo === 'FABRICA');
  const ventas = sucursales.filter((s) => s.tipo === 'VENTA');

  return (
    <div className="card">
      <h2>Mapa operacional</h2>
      <p className="subtitle">
        Vista general de la red: depósito central, fábricas y puntos de venta.
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="value">{sucursales.length}</div>
          <p className="label">Nodos totales</p>
        </div>
        <div className="stat">
          <div className="value">{deposito.length}</div>
          <p className="label">Galpón central</p>
        </div>
        <div className="stat">
          <div className="value">{fabricas.length}</div>
          <p className="label">Fábricas</p>
        </div>
        <div className="stat">
          <div className="value">{ventas.length}</div>
          <p className="label">Puntos de venta</p>
        </div>
      </div>

      <h3 style={{ margin: '8px 0 10px', fontSize: '0.95rem' }}>Galpón</h3>
      <div className="node-grid">
        {deposito.length === 0 && <div className="empty">Sin depósito configurado.</div>}
        {deposito.map((s) => (
          <div className="node deposito" key={s.id}>
            <h3>{s.nombre}</h3>
            <span className="tipo">Galpón central</span>
          </div>
        ))}
      </div>

      <h3 style={{ margin: '18px 0 10px', fontSize: '0.95rem' }}>Fábricas</h3>
      <div className="node-grid">
        {fabricas.length === 0 && <div className="empty">Sin fábricas.</div>}
        {fabricas.map((s) => (
          <div className="node" key={s.id}>
            <h3>{s.nombre}</h3>
            <span className="tipo">Fábrica</span>
          </div>
        ))}
      </div>

      <h3 style={{ margin: '18px 0 10px', fontSize: '0.95rem' }}>Puntos de venta</h3>
      <div className="node-grid">
        {ventas.length === 0 && <div className="empty">Sin puntos de venta.</div>}
        {ventas.map((s) => (
          <div className="node" key={s.id}>
            <h3>{s.nombre}</h3>
            <span className="tipo">Venta</span>
          </div>
        ))}
      </div>
    </div>
  );
}
