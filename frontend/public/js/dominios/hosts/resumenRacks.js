export function calcularResumenRacks(racks = []) {
  const resumen = {
    totalRacks: racks.length,
    totalServidores: 0,
    noCriticos: 0,
    criticos: 0,
    mantenimiento: 0
  };

  racks.forEach((rack) => {
    const servidores = Array.isArray(rack?.servers) ? rack.servers : [];
    resumen.totalServidores += servidores.length;

    servidores.forEach((servidor) => {
      const estado = String(servidor?.estado || servidor?.activo || '').toLowerCase();
      if (estado.includes('critico') || estado.includes('crit')) {
        resumen.criticos += 1;
      } else if (estado.includes('manten')) {
        resumen.mantenimiento += 1;
      } else {
        resumen.noCriticos += 1;
      }
    });
  });

  return resumen;
}

export function construirResumenRacksHtml(racks = []) {
  const resumen = calcularResumenRacks(racks);
  return `
    <div class="stat-card stat-card--racks">
      <div class="stat-card__head"><span class="stat-card__icon" aria-hidden="true">🗄️</span><div class="label">Total Racks</div></div>
      <div class="value">${resumen.totalRacks}</div>
      <div class="sub">Total Servidores: ${resumen.totalServidores}</div>
    </div>
    <div class="stat-card stat-card--servers">
      <div class="stat-card__head"><span class="stat-card__icon" aria-hidden="true">🔴</span><div class="label">Críticos</div></div>
      <div class="value" style="color:#dc2626">${resumen.criticos}</div>
    </div>
    <div class="stat-card stat-card--active">
      <div class="stat-card__head"><span class="stat-card__icon" aria-hidden="true">🟢</span><div class="label">No Críticos</div></div>
      <div class="value" style="color:#16a34a">${resumen.noCriticos}</div>
    </div>
    <div class="stat-card stat-card--inactive">
      <div class="stat-card__head"><span class="stat-card__icon" aria-hidden="true">🛠️</span><div class="label">Mantenimiento</div></div>
      <div class="value" style="color:#b45309">${resumen.mantenimiento}</div>
    </div>
  `;
}
