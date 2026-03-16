export function calcularResumenRacks(racks = []) {
  const resumen = {
    totalRacks: racks.length,
    totalServidores: 0,
    activos: 0,
    inactivos: 0
  };

  racks.forEach((rack) => {
    const servidores = Array.isArray(rack?.servers) ? rack.servers : [];
    resumen.totalServidores += servidores.length;

    servidores.forEach((servidor) => {
      const estado = String(servidor?.estado || servidor?.activo || '').toLowerCase();
      if (estado === 'inactivo' || estado === 'apagado' || estado === 'no') {
        resumen.inactivos += 1;
      } else {
        resumen.activos += 1;
      }
    });
  });

  return resumen;
}

export function construirResumenRacksHtml(racks = []) {
  const resumen = calcularResumenRacks(racks);
  return `
    <div class="stat-card"><div class="label">Total Racks</div><div class="value" style="color:#1e293b">${resumen.totalRacks}</div></div>
    <div class="stat-card"><div class="label">Servidores</div><div class="value" style="color:#1e293b">${resumen.totalServidores}</div></div>
    <div class="stat-card"><div class="label">Activos</div><div class="value" style="color:#22c55e">${resumen.activos}</div></div>
    <div class="stat-card"><div class="label">Inactivos</div><div class="value" style="color:#ef4444">${resumen.inactivos}</div></div>
  `;
}
