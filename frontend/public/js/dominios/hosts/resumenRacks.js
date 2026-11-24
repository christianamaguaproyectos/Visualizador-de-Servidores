import { normalizarCriticidad } from './gabineteRack.js';

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
      // "NO_CRITICO" cuenta como no crítico; inactivo se suma a no críticos
      const estado = normalizarCriticidad(servidor?.estado || servidor?.activo, servidor?.activo);
      if (estado === 'critico') resumen.criticos += 1;
      else if (estado === 'mantenimiento') resumen.mantenimiento += 1;
      else resumen.noCriticos += 1;
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
      <div class="value u-color-critico">${resumen.criticos}</div>
    </div>
    <div class="stat-card stat-card--active">
      <div class="stat-card__head"><span class="stat-card__icon" aria-hidden="true">🟢</span><div class="label">No Críticos</div></div>
      <div class="value u-color-ok">${resumen.noCriticos}</div>
    </div>
    <div class="stat-card stat-card--inactive">
      <div class="stat-card__head"><span class="stat-card__icon" aria-hidden="true">🛠️</span><div class="label">Mantenimiento</div></div>
      <div class="value u-color-mantenimiento">${resumen.mantenimiento}</div>
    </div>
  `;
}
