import { inicializarGestorDiscos } from '/js/dominios/hosts/gestorDiscos.js';
import { construirResumenRacksHtml } from '/js/dominios/hosts/resumenRacks.js';
import { formatearDiscos } from '/js/dominios/hosts/colocacionRack.js';
import { construirGabineteHtml, construirAvisoSinUbicarHtml, construirSinRackHtml, construirLeyendaHtml, aplicarEstadosMonitoreo, contarMonitoreo, normalizarCriticidad, claveMonitoreo, CRITICIDADES, ESTADOS_MONITOREO } from '/js/dominios/hosts/gabineteRack.js';
import { confirmAction } from '/js/dominios/ui-system/modalConfirm.js';
import { esCancelacionPorSalida } from '/js/dominios/ui-system/salidaPagina.js';
import { pedirTexto } from '/js/dominios/ui-system/modalTexto.js';
import { trackUIEvent } from '/js/dominios/ui-system/uxTelemetry.js';
import { escapeHtml, textoSeguro } from '/js/dominios/ui-system/seguridadHtml.js';
import { apiFetch, apiJson } from '/js/dominios/ui-system/apiFetch.js';

// Esperar a que el DOM esté listo y verificar que estamos en una página correcta

document.addEventListener('DOMContentLoaded', function () {

  // Verificar que estamos en una página que tiene los elementos necesarios

  const app = document.getElementById('app');

  if (!app) {

    console.log('Esta página no requiere el script app.js');

    return;

  }



  const btnInicio = document.getElementById('btnInicio');

  const updatedAtEl = document.getElementById('updatedAt');



  // Solo continuar si encontramos los elementos necesarios

  if (!btnInicio || !updatedAtEl) {

    console.log('Elementos del DOM no encontrados');

    return;

  }



  // Detectar tipo de servidor basado en la ruta

  const serverType = window.location.pathname.includes('virtuales') ? 'virtuales' : 'fisicos';

  const isVirtuales = serverType === 'virtuales';

  let currentUserRole = null;
  // RBAC del cliente "fail-closed": solo lectura hasta confirmar que el usuario es admin
  let readOnlyUser = true;
  let readOnlyNoticeShown = false;

  function isReadOnlyUser() {
    return readOnlyUser;
  }

  function showReadOnlyToast() {
    if (readOnlyNoticeShown) return;
    readOnlyNoticeShown = true;
    showToast('Modo solo lectura: solo vista general. No puedes abrir ni modificar racks, servidores o VMs.', 'warning');
    setTimeout(() => { readOnlyNoticeShown = false; }, 2200);
  }

  function disableReadOnlyActions() {
    if (!isReadOnlyUser()) return;

    const selectors = [
      '#btnAddServer',
      '#btnAddRack',
      '#btnExportExcel',
      '#btnToggleLabels',
      '#btnCreateView',
      '#btnAddHost',
      '#btnEditCluster',
      '#btnDeleteCluster',
      '#btnAddVMToHost',
      '#btnDeleteRack',
      '#btnEditServer',
      '#btnDeleteServer',
      '.server-btn-edit',
      '.server-btn-delete',
      '.btn-edit-host',
      '.view-edit-btn',
      '.view-delete-btn'
    ];

    document.querySelectorAll(selectors.join(',')).forEach((el) => {
      if (el.tagName === 'BUTTON') el.disabled = true;
      el.classList.add('readonly-disabled');
      el.setAttribute('aria-disabled', 'true');
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.55';
      el.style.cursor = 'not-allowed';
    });
  }

  async function hydrateCurrentUserRole() {
    try {
      const response = await fetch('/api/auth/user');
      const data = await response.json();
      if (data?.success && data?.user) {
        currentUserRole = data.user.role;
        window.currentUser = data.user;
        readOnlyUser = !(currentUserRole === 'admin' || data.user.isSuperAdmin);
      }
    } catch (_) {
      readOnlyUser = true; // si no se pudo verificar la sesión, NO se habilitan acciones de escritura
    } finally {
      disableReadOnlyActions();
    }
  }

  // Las vistas se montan DESPUÉS de conocer el rol (ver más abajo: sesionLista.finally(fetchData))
  const sesionLista = hydrateCurrentUserRole();



  // Actualizar título según el tipo

  // Títulos y variable de altura del header por página

  if (isVirtuales) {

    document.title = 'Dashboard de Servidores Virtuales';

    const header = document.querySelector('header h1');

    if (header) header.textContent = 'Servidores Virtuales';

  } else {

    document.title = 'Diagrama de Servidores Físicos';

  }

  // Calcular altura del header para CSS en ambas vistas

  try {

    const hh = document.querySelector('header')?.getBoundingClientRect()?.height || 72;

    document.documentElement.style.setProperty('--header-h', `${Math.round(hh)}px`);

  } catch (_) { }



  // ====== GESTION DE DISCOS POR DOMINIO HOSTS ======
  const gestorDiscos = inicializarGestorDiscos({
    idContenedor: 'discosContainer',
    idBotonAgregar: 'btnAddDisco'
  });

  const addDiscoRow = gestorDiscos.agregarDisco;
  const getDiscosJSON = gestorDiscos.obtenerDiscosComoJson;
  const populateDiscos = gestorDiscos.poblarDiscos;

  // Exponer funciones de discos globalmente para serverManager.js
  window.addDiscoRow = addDiscoRow;
  window.getDiscosJSON = getDiscosJSON;
  window.populateDiscos = populateDiscos;
  // serverManager.js la usa para refrescar la vista después de guardar o eliminar
  window.recargarDatosServidores = () => fetchData();
  // rackDragDrop.js recarga la vista con esta función tras mover un servidor
  window.loadAllData = () => fetchData();



  // Función para formatear discos en la vista de detalles

  function formatDiscosDisplay(discosValue) {
    return formatearDiscos(discosValue);
  }

  window.formatDiscosDisplay = formatDiscosDisplay;





  let DATA = { racks: [], servers: [], meta: {} };
  // Estado de monitoreo en vivo por servidor (id → UP/DOWN/DEGRADED/MAINTENANCE/UNKNOWN), solo físicos
  let estadosMonitoreo = new Map();
  let estadosMonitoreoCargados = false;
  // Virtuales: estado del servidor físico que hace de host (por nombre)
  let estadosHostPorNombre = new Map();
  let consultandoMonitoreo = false;

  async function cargarEstadosMonitoreo() {
    if (consultandoMonitoreo) return;
    consultandoMonitoreo = true;
    try {
      // Estado de monitoreo de cada servidor del inventario (misma regla de cruce que Impacto de servicios)
      const r = await apiJson('/api/impacto/servidores');
      const mapa = new Map();
      const porNombre = new Map();
      for (const n of r?.servers || []) {
        const estado = n.monitoring ? n.status : 'UNKNOWN';
        mapa.set(String(n.id), estado);
        if (n.type === 'fisicos' && n.name) porNombre.set(String(n.name).toLowerCase(), estado);
      }
      const firmaAnterior = [...estadosMonitoreo].join();
      estadosMonitoreo = mapa;
      estadosHostPorNombre = porNombre;
      if (isVirtuales) {
        // Virtuales: el resumen consolidado por host/clúster se vuelve a dibujar si algo cambió
        const primeraCarga = !estadosMonitoreoCargados;
        estadosMonitoreoCargados = true;
        if ((primeraCarga || firmaAnterior !== [...mapa].join()) && !location.hash) renderVirtualView();
        else aplicarEstadosMonitoreo(document, estadosMonitoreo);
        return;
      }
      estadosMonitoreoCargados = true;
      aplicarEstadosMonitoreo(document, estadosMonitoreo);
      document.querySelectorAll('[data-led-texto]').forEach((el) => {
        el.textContent = ESTADOS_MONITOREO[claveMonitoreo(estadosMonitoreo.get(el.getAttribute('data-led-texto')))].texto;
      });
      // Contadores por estado en la leyenda de la vista general
      const conteos = contarMonitoreo((DATA.racks || []).flatMap((r) => r.servers || []), estadosMonitoreo);
      const leyenda = document.querySelector('#app > .gab-leyenda');
      if (leyenda && !leyenda.querySelector('[data-conteo-monitoreo]')) {
        leyenda.outerHTML = construirLeyendaHtml({ conteos });
      } else {
        document.querySelectorAll('[data-conteo-monitoreo]').forEach((el) => { el.textContent = String(conteos[el.getAttribute('data-conteo-monitoreo')] || 0); });
      }
    } catch (_) {
      // Sin monitoreo disponible: los LED quedan como "sin datos"
    } finally {
      consultandoMonitoreo = false;
    }
  }
  setInterval(() => { if (document.visibilityState === 'visible') cargarEstadosMonitoreo(); }, 30000);

  let lastUpdatedAt = null; // Para detectar cambios y mostrar toast

  // Estado UI para físicos

  const state = {

    metricsCache: new Map(), // serverId -> {cpu, ram, disk, temp, uptime}

    filter: 'all',

    search: ''

  };

  const PHYSICAL_PAGE_SIZES = [4, 5, 6, 8, 10, 12];
  const storedRackPageSize = Number(localStorage.getItem('physicalRackPageSize') || 6);
  const physicalPager = {
    page: 1,
    size: PHYSICAL_PAGE_SIZES.includes(storedRackPageSize) ? storedRackPageSize : 6
  };

  // Estado y definición para vistas especializadas de servidores virtuales

  const virtualState = {

    mode: null,

    clusterKey: null,

    clusters: [],

    clusterHostsById: {},

    rackById: {},

    vmFilter: 'all',    // Filtro de estado para VMs

    vmSearch: ''        // Búsqueda de VMs

  };

  const VIRTUAL_PREVIEW_LIMIT = 6;

  const VIRTUAL_GROUPS = {

    menu: [

      { key: 'clusters', label: 'Clusters Danec', description: 'Agrupa los hosts por clústeres definidos' },

      { key: 'vsphere', label: 'VMware vSphere', description: 'Hosts dedicados a VMware vSphere' },
      { key: 'todos', label: 'Todos los hosts', description: 'Todos los hosts del inventario, estén o no en un clúster' }

    ]

  };

  // Mostrar/ocultar etiquetas laterales con IP/Hostname en racks físicos (persistido)

  let SHOW_SERVER_LABELS = localStorage.getItem('showServerLabels') === '1';

  const toggleBtn = document.getElementById('btnToggleLabels');

  if (toggleBtn && !isVirtuales) {

    const setBtnText = () => toggleBtn.textContent = SHOW_SERVER_LABELS ? '🙈 Ocultar detalles tecnicos' : '👁️ Mostrar detalles tecnicos';

    setBtnText();

    toggleBtn.addEventListener('click', async () => {

      SHOW_SERVER_LABELS = !SHOW_SERVER_LABELS;

      localStorage.setItem('showServerLabels', SHOW_SERVER_LABELS ? '1' : '0');
      trackUIEvent('physical.labels.toggle', {
        enabled: SHOW_SERVER_LABELS,
        view: serverType
      });

      setBtnText();

      // Re-render físico en caliente

      try { renderHome(); } catch (_) { }

    });

  }



  // Botón exportar Excel para servidores físicos

  if (!isVirtuales) {

    const btnExportExcel = document.getElementById('btnExportExcel');

    btnExportExcel?.addEventListener('click', async () => {

      try {

        showToast('Generando archivo Excel...');

        const response = await fetch('/api/export/fisicos');

        if (!response.ok) {

          throw new Error('Error al exportar');

        }

        const blob = await response.blob();

        const url = window.URL.createObjectURL(blob);

        const a = document.createElement('a');

        a.href = url;

        const fecha = new Date().toISOString().split('T')[0];

        a.download = `servidores_fisicos_${fecha}.xlsx`;

        document.body.appendChild(a);

        a.click();

        window.URL.revokeObjectURL(url);

        document.body.removeChild(a);

        showToast('✅ Excel exportado correctamente');

      } catch (err) {

        if (esCancelacionPorSalida(err)) return;
        console.error('Error exportando:', err);

        showToast('❌ Error al exportar Excel');

      }

    });

  }



  // ====== VIRTUALES: Modales para VM y Host ======

  const serverModal = document.getElementById('serverModal');

  const rackAddModal = document.getElementById('rackAddModal');

  const serverForm = document.getElementById('serverForm');

  const rackForm = document.getElementById('rackForm');

  const btnAddServer = document.getElementById('btnAddServer');

  const btnAddRack = document.getElementById('btnAddRack');

  // Marca si el formulario de servidor tiene cambios sin guardar (evita perder
  // trabajo al cerrar sin guardar). Se resetea al abrir el modal.
  let serverFormDirty = false;



  // El alta/edición de servidores la gestiona SOLO /js/modules/serverManager.js
  // (antes había dos implementaciones que se pisaban). Aquí solo se delega.
  function openServerModal(initialRackName) {
    if (isReadOnlyUser()) {
      showReadOnlyToast();
      return;
    }
    window.serverManager?.openServerModal(initialRackName);
  }



  function closeServerModal() {

    if (serverModal) serverModal.style.display = 'none';

  }



  function openRackModal() {

    if (isReadOnlyUser()) {
      showReadOnlyToast();
      return;
    }

    if (!isVirtuales || !rackAddModal || !rackForm) return;

    rackForm.reset();

    // Reset to create mode

    const rackIdEl = document.getElementById('rackId');

    if (rackIdEl) rackIdEl.value = '';

    const titleEl = document.getElementById('rackModalTitle');

    if (titleEl) titleEl.textContent = '🖥️ Agregar Host';

    const submitBtn = document.getElementById('rackFormSubmit');

    if (submitBtn) submitBtn.textContent = '✅ Crear Host';

    rackAddModal.style.display = 'flex';

  }



  function closeRackModal() {

    if (rackAddModal) rackAddModal.style.display = 'none';

  }



  // openServerModalForEdit y deleteServer viven en /js/modules/serverManager.js
  // (window.serverManager). No se redefine window.serverManager aquí.



  // Event listeners para modales - disponibles en ambas páginas

  document.getElementById('serverModalClose')?.addEventListener('click', closeServerModal);

  document.getElementById('serverFormCancel')?.addEventListener('click', closeServerModal);

  // ---- Guarda de cambios sin guardar en el formulario de servidor ----
  // Cualquier edición del usuario (incluidos los campos de discos, que están
  // dentro del form) marca el formulario como modificado.
  serverForm?.addEventListener('input', () => { serverFormDirty = true; });
  serverForm?.addEventListener('change', () => { serverFormDirty = true; });
  // Agregar/quitar filas de disco es una modificación estructural.
  document.getElementById('btnAddDisco')?.addEventListener('click', () => { serverFormDirty = true; });
  serverForm?.addEventListener('click', (e) => {
    if (e.target.closest('.disco-remove')) serverFormDirty = true;
  });

  // Intercepta el cierre/cancelar. El listener se registra en el ANCESTRO
  // (serverModal) en fase de captura, de modo que corre antes que los handlers
  // de cierre de los botones. Si hay cambios, pregunta si guardar o descartar.
  serverModal?.addEventListener('click', (e) => {
    if (!e.target.closest('#serverModalClose, #serverFormCancel')) return;
    if (!serverFormDirty) return; // sin cambios: cerrar normal
    e.preventDefault();
    e.stopImmediatePropagation(); // impide que el modal se cierre todavía
    confirmAction({
      title: 'Cambios sin guardar',
      message: 'Tienes cambios sin guardar en este formulario. ¿Deseas guardarlos antes de cerrar?',
      confirmText: '💾 Guardar',
      cancelText: 'Descartar',
      tone: 'primary'
    }).then((guardar) => {
      serverFormDirty = false;
      if (guardar) {
        serverForm?.requestSubmit(); // dispara el guardado completo
      } else {
        closeServerModal();
      }
    });
  }, true);

  // Note: Modal no longer closes on outside click - only via X button or Cancel



  // El envío de #serverForm lo maneja SOLO serverManager.js (un único listener "submit"):
  // así cada guardado hace UNA sola petición y conserva todos los campos.
  // Al abrir el modal, serverManager.js emite "serverform:abierto" para reiniciar la marca de cambios.
  serverForm?.addEventListener('serverform:abierto', () => { serverFormDirty = false; });



  // Event listeners específicos de virtuales (rack modals, botones agregar)

  if (isVirtuales) {

    // btnAddServer lo registra serverManager.js (evita abrir el modal dos veces)

    btnAddRack?.addEventListener('click', () => openRackModal());



    // Botón exportar Excel para virtuales

    const btnExportExcel = document.getElementById('btnExportExcel');

    btnExportExcel?.addEventListener('click', async () => {

      try {

        showToast('Generando archivo Excel...');

        const response = await fetch('/api/export/virtuales');

        if (!response.ok) {

          throw new Error('Error al exportar');

        }

        const blob = await response.blob();

        const url = window.URL.createObjectURL(blob);

        const a = document.createElement('a');

        a.href = url;

        const fecha = new Date().toISOString().split('T')[0];

        a.download = `maquinas_virtuales_${fecha}.xlsx`;

        document.body.appendChild(a);

        a.click();

        window.URL.revokeObjectURL(url);

        document.body.removeChild(a);

        showToast('✅ Excel exportado correctamente');

      } catch (err) {

        if (esCancelacionPorSalida(err)) return;
        console.error('Error exportando:', err);

        showToast('❌ Error al exportar Excel');

      }

    });



    document.getElementById('rackAddModalClose')?.addEventListener('click', closeRackModal);

    document.getElementById('rackFormCancel')?.addEventListener('click', closeRackModal);

    // Note: Rack modal no longer closes on outside click - only via X button or Cancel



    // Function to open rack modal for editing

    function openRackModalForEdit(rack) {

      if (!rackAddModal || !rackForm) return;

      const titleEl = document.getElementById('rackModalTitle');

      if (titleEl) titleEl.textContent = '🖥️✏️ Editar Host';

      const submitBtn = document.getElementById('rackFormSubmit');

      if (submitBtn) submitBtn.textContent = '💾 Guardar Host';



      const rackIdEl = document.getElementById('rackId');

      if (rackIdEl) rackIdEl.value = rack.id;

      const rackNameEl = document.getElementById('rackName');

      if (rackNameEl) rackNameEl.value = rack.name || '';



      rackAddModal.style.display = 'flex';

    }



    // Expose openRackModalForEdit globally

    window.openRackModalForEdit = openRackModalForEdit;

    // Botón "✏️ Editar" de cada host (sin onclick inline). Se registra aquí, en la parte de
    // virtuales: dentro de wirePhysicalUX() nunca llegaba a registrarse en esta página.
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-edit-host');
      if (!btn) return;

      if (isReadOnlyUser()) {
        e.preventDefault();
        e.stopPropagation();
        showReadOnlyToast();
        return;
      }

      e.stopPropagation();
      const id = Number(btn.getAttribute('data-host-id'));
      const encodedName = btn.getAttribute('data-host-name') || '';
      if (!Number.isInteger(id) || id <= 0) return;

      window.openRackModalForEdit({ id, name: decodeURIComponent(encodedName) });
    });



    rackForm?.addEventListener('submit', async (e) => {

      e.preventDefault();

      try {

        const rackId = document.getElementById('rackId')?.value?.trim();

        const rackName = document.getElementById('rackName')?.value?.trim();

        const isEdit = !!rackId;



        if (!rackName) {

          showToast('Nombre del host obligatorio', 'warning');

          return;

        }



        const url = isEdit ? `/api/racks/${rackId}` : '/api/racks';

        const method = isEdit ? 'PUT' : 'POST';



        const res = await fetch(url, {

          method,

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({

            name: rackName,

            raw_name: rackName,

            type: 'virtuales'  // Siempre virtual desde la vista virtual

          })

        });

        const result = await res.json();

        if (!res.ok) {

          showToast(result.error || (isEdit ? 'Error actualizando host' : 'Error creando host'), 'error');

          return;

        }

        if (!isEdit && virtualState.mode === 'clusterDetail' && virtualState.clusterKey) {

          const clusterDef = getClusterDefinition(virtualState.clusterKey);

          if (clusterDef) {

            await fetch(`/api/clusters/${clusterDef.id}/hosts`, {

              method: 'POST',

              headers: { 'Content-Type': 'application/json' },

              body: JSON.stringify({ rack_id: result.id })

            });

          }

        }



        closeRackModal();

        await fetchData();

        showToast(isEdit ? 'Host actualizado correctamente' : 'Host creado y asignado correctamente');

      } catch (err) {

        console.error('Error guardando host:', err);

        showToast('Error de red guardando host', 'error');

      }

    });

  }



  // Notificaciones: se usa SIEMPRE el toast global de /toast.js (seguro contra XSS).
  // Antes había una copia local showToast(message, duration) que sombreaba la global:
  // las llamadas showToast('...', 'error') daban setTimeout(NaN) y el error desaparecía al instante.
  function showToast(message, type = 'info', duration) {
    if (typeof window.showToast === 'function') {
      return window.showToast(message, type, duration);
    }
    console.log(message);
    return null;
  }



  // escapeHtml viene del módulo compartido /js/dominios/ui-system/seguridadHtml.js
  function fmt(val) {
    return textoSeguro(val);
  }

  function renderErrorBlock(mensaje) {
    if (!mensaje) return '';
    return `<div class="error">${fmt(mensaje)}</div>`;
  }

  function statusClass(estado) {

    const e = normalizeEstado(estado);

    return e; // critico, activo, normal

  }



  // Normaliza el estado del servidor a: critico, activo, normal

  function normalizeEstado(estado) {
    // "NO_CRITICO" es no crítico (antes contaba como crítico por contener la palabra)
    return normalizarCriticidad(estado, estado);
  }

  function getRackStatusSummary(servers = []) {
    const summary = {
      totalServers: servers.length,
      criticos: 0,
      mantenimiento: 0,
      noCriticos: 0,
      occupiedUnits: 0
    };

    servers.forEach((server) => {
      const estado = normalizeEstado(server?.estado || server?.activo || '');
      if (estado === 'critico') summary.criticos += 1;
      else if (estado === 'mantenimiento') summary.mantenimiento += 1;
      else summary.noCriticos += 1;

      const units = Number(server?.rackUnits || server?.rack_units || 2);
      summary.occupiedUnits += Number.isFinite(units) && units > 0 ? units : 2;
    });

    summary.occupiedUnits = Math.min(summary.occupiedUnits, 42);
    summary.occupancyPct = Math.min(100, Math.round((summary.occupiedUnits / 42) * 100));
    return summary;
  }

  function getRackModelPreview(servers = []) {
    const modelCounts = new Map();
    servers.forEach((server) => {
      const model = (server?.modelo || server?.marca || '').toString().trim();
      if (!model) return;
      modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
    });

    if (modelCounts.size === 0) return 'Sin modelo registrado';
    return Array.from(modelCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([model, count]) => `${fmt(model)} (${count})`)
      .join(' · ');
  }

  function getPhysicalRackPagination(totalRacks) {
    const total = Math.max(0, Number(totalRacks) || 0);
    const totalPages = Math.max(1, Math.ceil(total / physicalPager.size));
    if (physicalPager.page > totalPages) physicalPager.page = totalPages;
    if (physicalPager.page < 1) physicalPager.page = 1;

    const start = total === 0 ? 0 : (physicalPager.page - 1) * physicalPager.size;
    const end = Math.min(total, start + physicalPager.size);
    return {
      total,
      totalPages,
      page: physicalPager.page,
      start,
      end
    };
  }

  // ====== RACK ORDERING (persistido en localStorage) ======
  function getCustomRackOrder() {
    try {
      const stored = localStorage.getItem('physicalRackOrder');
      if (stored) return JSON.parse(stored);
    } catch (_) { }
    return null;
  }

  function saveCustomRackOrder(orderArray) {
    localStorage.setItem('physicalRackOrder', JSON.stringify(orderArray));
  }

  function applyCustomRackOrder(racks) {
    const order = getCustomRackOrder();
    if (!order || !Array.isArray(order) || order.length === 0) return racks;
    const rackMap = new Map();
    racks.forEach(r => rackMap.set(r.name, r));
    const ordered = [];
    // Primero los que están en el orden personalizado
    order.forEach(name => {
      if (rackMap.has(name)) {
        ordered.push(rackMap.get(name));
        rackMap.delete(name);
      }
    });
    // Luego los nuevos que no estaban en el orden
    rackMap.forEach(r => ordered.push(r));
    return ordered;
  }

  function openRackOrderModal(racks) {
    // Crear o reutilizar modal
    let modal = document.getElementById('rackOrderModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'rackOrderModal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    const pageSize = physicalPager.size;
    const totalPages = Math.ceil(racks.length / pageSize);

    const renderList = () => {
      const items = racks.map((r, idx) => {
        const page = Math.floor(idx / pageSize) + 1;
        const isPageStart = idx % pageSize === 0;
        const pageDivider = isPageStart ? `<div class="rack-order-divider">📄 Página ${page}</div>` : '';
        return `${pageDivider}<div class="rack-order-item" draggable="true" data-rack-idx="${idx}" data-rack-name="${encodeURIComponent(r.name)}">
          <span class="rack-order-handle">☰</span>
          <span class="rack-order-name">${fmt(r.name)}</span>
          <span class="rack-order-page">Pág ${page}</span>
          <span class="rack-order-servers">${r.servers?.length || 0} srv</span>
          <span class="rack-order-arrows">
            <button type="button" class="rack-order-btn" data-move="up" ${idx === 0 ? 'disabled' : ''} title="Subir">▲</button>
            <button type="button" class="rack-order-btn" data-move="down" ${idx === racks.length - 1 ? 'disabled' : ''} title="Bajar">▼</button>
          </span>
        </div>`;
      }).join('');
      return items;
    };

    modal.innerHTML = `
      <div class="modal-content rack-order-modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h3>🔧 Organizar Racks en Páginas</h3>
          <button class="modal-close" id="rackOrderClose">✕ Cerrar</button>
        </div>
        <div class="modal-body">
          <p class="rack-order-hint">Arrastra los racks o usa las flechas ▲▼ para cambiar su orden. Los racks se distribuirán en páginas de <strong>${pageSize}</strong> racks.</p>
          <div class="rack-order-list" id="rackOrderList">
            ${renderList()}
          </div>
          <div class="rack-order-actions">
            <button type="button" class="btn btn-secondary" id="rackOrderReset">🔄 Restablecer orden original</button>
            <button type="button" class="btn btn-primary" id="rackOrderSave">💾 Guardar orden</button>
          </div>
        </div>
      </div>
    `;
    modal.style.display = 'flex';

    // Close
    document.getElementById('rackOrderClose')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    // Move up/down with arrows
    const list = document.getElementById('rackOrderList');
    list?.addEventListener('click', (e) => {
      const btn = e.target.closest('.rack-order-btn');
      if (!btn) return;
      const item = btn.closest('.rack-order-item');
      const idx = Number(item?.getAttribute('data-rack-idx'));
      const dir = btn.getAttribute('data-move');
      if (dir === 'up' && idx > 0) {
        [racks[idx - 1], racks[idx]] = [racks[idx], racks[idx - 1]];
      } else if (dir === 'down' && idx < racks.length - 1) {
        [racks[idx], racks[idx + 1]] = [racks[idx + 1], racks[idx]];
      }
      list.innerHTML = renderList();
    });

    // Drag and drop
    let dragIdx = null;
    list?.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.rack-order-item');
      if (!item) return;
      dragIdx = Number(item.getAttribute('data-rack-idx'));
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    list?.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const item = e.target.closest('.rack-order-item');
      if (item) {
        list.querySelectorAll('.rack-order-item').forEach(el => el.classList.remove('drop-target'));
        item.classList.add('drop-target');
      }
    });

    list?.addEventListener('drop', (e) => {
      e.preventDefault();
      const item = e.target.closest('.rack-order-item');
      if (!item || dragIdx === null) return;
      const dropIdx = Number(item.getAttribute('data-rack-idx'));
      if (dragIdx !== dropIdx) {
        const [moved] = racks.splice(dragIdx, 1);
        racks.splice(dropIdx, 0, moved);
      }
      dragIdx = null;
      list.querySelectorAll('.rack-order-item').forEach(el => el.classList.remove('dragging', 'drop-target'));
      list.innerHTML = renderList();
    });

    list?.addEventListener('dragend', () => {
      dragIdx = null;
      list.querySelectorAll('.rack-order-item').forEach(el => el.classList.remove('dragging', 'drop-target'));
    });

    // Save
    document.getElementById('rackOrderSave')?.addEventListener('click', () => {
      const newOrder = racks.map(r => r.name);
      saveCustomRackOrder(newOrder);
      modal.style.display = 'none';
      showToast('Orden de racks guardado');
      renderHome();
    });

    // Reset
    document.getElementById('rackOrderReset')?.addEventListener('click', () => {
      localStorage.removeItem('physicalRackOrder');
      modal.style.display = 'none';
      showToast('Orden de racks restablecido');
      renderHome();
    });
  }

  function renderPhysicalPaginationControls(pager) {
    const from = pager.total === 0 ? 0 : pager.start + 1;
    const to = pager.end;
    const options = PHYSICAL_PAGE_SIZES
      .map((size) => `<option value="${size}" ${size === physicalPager.size ? 'selected' : ''}>${size}</option>`)
      .join('');

    const hasCustomOrder = !!getCustomRackOrder();

    return `
      <div class="rack-pagination" id="rackPagination">
        <div class="rack-pagination__left">
          <label for="rackPageSize" class="rack-pagination__label">Racks por pagina</label>
          <select id="rackPageSize" class="rack-pagination__select">${options}</select>
          <span class="rack-pagination__summary">Mostrando ${from}-${to} de ${pager.total}</span>
        </div>
        <div class="rack-pagination__center">
          <button type="button" class="btn btn-secondary btn-sm" id="btnOrganizarRacks" title="Reorganizar racks entre páginas">🔧 Organizar Racks</button>
          ${hasCustomOrder ? '<span class="rack-order-badge" title="Orden personalizado activo">✨ Orden personalizado</span>' : ''}
        </div>
        <div class="rack-pagination__right">
          <button type="button" class="btn btn-secondary btn-sm" data-rack-page-action="first" ${pager.page <= 1 ? 'disabled' : ''}>Primera</button>
          <button type="button" class="btn btn-secondary btn-sm" data-rack-page-action="prev" ${pager.page <= 1 ? 'disabled' : ''}>Anterior</button>
          <span class="rack-pagination__page">Pagina ${pager.page} de ${pager.totalPages}</span>
          <button type="button" class="btn btn-secondary btn-sm" data-rack-page-action="next" ${pager.page >= pager.totalPages ? 'disabled' : ''}>Siguiente</button>
          <button type="button" class="btn btn-secondary btn-sm" data-rack-page-action="last" ${pager.page >= pager.totalPages ? 'disabled' : ''}>Ultima</button>
        </div>
      </div>
    `;
  }



  function renderHome() {

    console.log('renderHome called with DATA:', DATA);

    const racks = DATA.racks;

    console.log('Racks to render:', racks ? racks.length : 0);

    console.log('Full racks array:', racks);



    // Show content and hide loading

    const loadingEl = document.getElementById('loading');

    const contentEl = document.getElementById('content');

    if (loadingEl) loadingEl.style.display = 'none';

    if (contentEl) contentEl.style.display = 'block';



    // Físicos sin rack asignado: se muestran aparte (no pertenecen a ningún rack)
    const sinRack = isVirtuales ? [] : (DATA.servers || []).filter((s) => s.rackId == null || s.rackId === '');

    if ((!racks || racks.length === 0) && !sinRack.length) {

      console.log('No racks to display - showing fallback message');

      app.innerHTML = `

      <div class="loading">

        <h2>No se encontraron racks para mostrar</h2>

        <p>Todavía no hay racks registrados en esta vista.</p>

      </div>

    `;

      return;

    }



    console.log('About to render racks:', racks.map(r => ({ name: r.name, serverCount: r.servers.length })));



    // If we are on virtuales, render modern card-based hosts/VMs; otherwise keep legacy rack view

    if (isVirtuales) {

      if (!virtualState.mode) virtualState.mode = 'menu';

      renderVirtualView();

      return;

    } else {
      const physicalRenderStart = performance.now();

      // FÍSICOS: rack view con hooks para interactividad

      // Panel overview arriba (se rellena luego)

      try { document.getElementById('overview').style.display = 'flex'; } catch (_) { }

      // Asegura que el contenedor #content esté visible para evitar huecos

      try { document.getElementById('content').style.display = 'block'; } catch (_) { }

      // Aplicar orden personalizado de racks
      const orderedRacks = applyCustomRackOrder([...racks]);
      const pager = getPhysicalRackPagination(orderedRacks.length);
      const visibleRacks = orderedRacks.slice(pager.start, pager.end).map((rack, idx) => ({
        rack,
        globalIndex: pager.start + idx
      }));

      const totalPorEstado = contarMonitoreo(orderedRacks.flatMap((r) => r.servers || []), estadosMonitoreo);
      app.innerHTML = `
      ${renderErrorBlock(DATA.meta?.error)}
      ${renderPhysicalPaginationControls(pager)}
      ${construirLeyendaHtml({ conteos: estadosMonitoreoCargados ? totalPorEstado : null })}
      <div class="gab-grid rack-grid--gab">
        ${visibleRacks.map(({ rack: r }) => {
          const servidores = r.servers || [];
          const summary = getRackStatusSummary(servidores);
          const modelPreview = getRackModelPreview(servidores);
          const gab = construirGabineteHtml({
            nombreRack: r.name,
            servidores,
            estados: estadosMonitoreo,
            detalle: SHOW_SERVER_LABELS,
            numeracionAscendente: /^rack\s*1$/i.test((r.name || '').trim()),
          });
          const pct = Math.round((gab.ocupadas / 42) * 100);
          const nombre = encodeURIComponent(r.name);
          return `
          <article class="gab-card" data-rack-name="${escapeHtml(nombre)}" data-name="${escapeHtml(nombre)}" data-idx="${DATA.racks.findIndex(rack => rack.name === r.name)}" aria-label="Rack ${escapeHtml(r.name)}">
            <div class="gab-card__cab rack-content">
              <div>
                <h2>${escapeHtml(r.name)}</h2>
                <div class="gab-card__sub">${servidores.length} servidores instalados</div>
              </div>
              <span class="gab-card__ocup" title="Unidades ocupadas">${gab.ocupadas}/42U</span>
            </div>
            <div class="gab-card__kpis">
              <span class="gab-kpi" title="Críticos"><span class="gab-crit gab-crit--critico" aria-hidden="true"></span>${summary.criticos}</span>
              <span class="gab-kpi" title="No críticos"><span class="gab-crit gab-crit--no-critico" aria-hidden="true"></span>${summary.noCriticos}</span>
              <span class="gab-kpi" title="En mantenimiento"><span class="gab-crit gab-crit--mantenimiento" aria-hidden="true"></span>${summary.mantenimiento}</span>
            </div>
            <div class="gab-barra" title="Ocupación ${pct}%"><span class="gab-ancho-${Math.min(100, Math.round(pct / 5) * 5)}"></span></div>
            ${gab.html}
            ${construirAvisoSinUbicarHtml(gab.sinUbicar, estadosMonitoreo)}
            <div class="rack-tech-hint ${SHOW_SERVER_LABELS ? 'mostrar' : ''}" aria-label="Detalle técnico del rack ${escapeHtml(r.name)}">
              <div class="rack-tech-hint__row"><strong>Ocupación:</strong> ${gab.ocupadas}U de 42U (${pct}%) · ${gab.libres}U libres</div>
              <div class="rack-tech-hint__row"><strong>Modelos:</strong> ${escapeHtml(modelPreview)}</div>
            </div>
          </article>`;
        }).join('')}
      </div>
      ${sinRack.length ? `<div class="gab-grid gab-grid--sin-rack">${construirSinRackHtml(sinRack, estadosMonitoreo)}</div>` : ''}
    `;
      const paginationEl = document.getElementById('rackPagination');
      paginationEl?.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-rack-page-action]');
        if (!btn) return;

        const action = btn.getAttribute('data-rack-page-action');
        const pagerNow = getPhysicalRackPagination(racks.length);
        if (action === 'first') physicalPager.page = 1;
        if (action === 'prev') physicalPager.page = Math.max(1, pagerNow.page - 1);
        if (action === 'next') physicalPager.page = Math.min(pagerNow.totalPages, pagerNow.page + 1);
        if (action === 'last') physicalPager.page = pagerNow.totalPages;
        trackUIEvent('physical.pagination.navigate', {
          action,
          page: physicalPager.page,
          totalPages: pagerNow.totalPages,
          pageSize: physicalPager.size
        });
        renderHome();
      });

      document.getElementById('rackPageSize')?.addEventListener('change', (event) => {
        const selected = Number(event.target.value || physicalPager.size);
        if (!PHYSICAL_PAGE_SIZES.includes(selected)) return;
        physicalPager.size = selected;
        physicalPager.page = 1;
        localStorage.setItem('physicalRackPageSize', String(selected));
        trackUIEvent('physical.pagination.page_size_change', {
          pageSize: selected
        });
        renderHome();
      });

      // Botón para organizar racks
      document.getElementById('btnOrganizarRacks')?.addEventListener('click', () => {
        const orderedCopy = applyCustomRackOrder([...racks]);
        openRackOrderModal(orderedCopy);
      });

      const renderMs = Math.max(0, performance.now() - physicalRenderStart);
      const summaryEl = document.querySelector('.rack-pagination__summary');
      if (summaryEl) {
        summaryEl.textContent = `${summaryEl.textContent} · Render ${renderMs.toFixed(1)} ms`;
      }
      trackUIEvent('physical.racks.render', {
        renderMs: Number(renderMs.toFixed(2)),
        page: pager.page,
        pageSize: physicalPager.size,
        visibleRacks: visibleRacks.length,
        totalRacks: racks.length
      });

      wirePhysicalUX();
    }



    console.log('renderHome completed, innerHTML set');

  }



  function changeVirtualMode(mode) {

    if (!isVirtuales) return;

    const allowed = new Set(['menu', 'clusters', 'vsphere', 'todos']);

    const nextMode = allowed.has(mode) ? mode : 'menu';

    virtualState.mode = nextMode;

    if (nextMode !== 'clusterDetail') virtualState.clusterKey = null;

    if (location.hash) {

      location.hash = '';

    } else {

      renderVirtualView();

    }

  }



  function showClusterDetail(key) {

    if (!isVirtuales) return;

    virtualState.clusterKey = key;

    virtualState.mode = 'clusterDetail';

    renderVirtualView();

  }



  function getClusterDefinition(key) {

    if (!key) return null;

    const cluster = (virtualState.clusters || []).find(c => c.key === key);

    if (!cluster) return null;

    return { ...cluster, source: cluster.type === 'vsphere' ? 'vsphere' : 'clusters' };

  }



  // Función para inicializar búsqueda y filtro en servidores virtuales

  function initVMSearchAndFilter() {

    const searchVMs = document.getElementById('searchVMs');

    const filterVMStatus = document.getElementById('filterVMStatus');

    if (!isVirtuales) return;



    // Función para aplicar filtros y re-renderizar

    function applyVMFilters() {

      const q = (searchVMs?.value || '').toLowerCase().trim();

      const f = filterVMStatus?.value || 'all';



      // Actualizar estado

      virtualState.vmSearch = q;

      virtualState.vmFilter = f;



      // Re-renderizar la vista actual para que las tarjetas muestren las VMs filtradas

      renderVirtualView();



      // Scroll al primer resultado si hay búsqueda

      if (q) {

        setTimeout(() => {

          const firstMatch = document.querySelector('.vm-node.vm-match, .host-card:not(.host-no-matches)');

          if (firstMatch) {

            firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });

          }

        }, 100);

      }

    }



    // Event listeners

    searchVMs?.addEventListener('input', debounce(applyVMFilters, 300));

    filterVMStatus?.addEventListener('change', applyVMFilters);

  }



  // Función debounce para evitar demasiadas re-renderizaciones

  function debounce(func, wait) {

    let timeout;

    return function executedFunction(...args) {

      const later = () => {

        clearTimeout(timeout);

        func(...args);

      };

      clearTimeout(timeout);

      timeout = setTimeout(later, wait);

    };

  }



  // Aplicar estilos visuales después del render

  function applyVMVisualStyles() {

    const hasFilter = virtualState.vmFilter !== 'all' || virtualState.vmSearch;



    // Ocultar hosts sin coincidencias cuando hay filtro activo

    document.querySelectorAll('.host-card').forEach(card => {

      const hasMatches = card.querySelector('.vm-match') !== null;

      const noMatchClass = card.classList.contains('host-no-matches');



      if (hasFilter && noMatchClass) {

        card.style.opacity = '0.4';

      } else {

        card.style.opacity = '';

      }

    });



    // Ocultar cluster sections vacíos

    document.querySelectorAll('.cluster-section').forEach(section => {

      const visibleCards = section.querySelectorAll('.host-card:not(.host-no-matches)');

      if (hasFilter && visibleCards.length === 0) {

        section.style.display = 'none';

      } else {

        section.style.display = '';

      }

    });

  }



  /**

   * Actualiza la visibilidad de los botones del header según el modo de vista

   * - menu: Ocultar ambos (Agregar VM y Agregar Host)

   * - clusters/vsphere: Solo mostrar Agregar Host

   * - clusterDetail: Solo mostrar Agregar Host (VMs se agregan dentro de un host)

   * - hostDetail (dentro de un host expandido): Mostrar Agregar VM

   */

  function updateHeaderButtons() {

    if (!isVirtuales) return;



    const btnAddServer = document.getElementById('btnAddServer');

    const btnAddRack = document.getElementById('btnAddRack');



    if (!btnAddServer || !btnAddRack) return;



    const mode = virtualState.mode || 'menu';

    const hasExpandedHost = virtualState.expandedHostId != null;



    switch (mode) {

      case 'menu':

        // En selección de vista: ocultar ambos

        btnAddServer.style.display = 'none';

        btnAddRack.style.display = 'none';

        break;

      case 'clusters':

      case 'vsphere':

      case 'clusterDetail':

        // En vista de clusters: solo mostrar Agregar Host

        btnAddServer.style.display = hasExpandedHost ? 'inline-flex' : 'none';

        btnAddRack.style.display = 'inline-flex';

        break;

      default:

        // Por defecto ocultar

        btnAddServer.style.display = 'none';

        btnAddRack.style.display = 'none';

    }

  }



  function renderVirtualView() {

    if (!isVirtuales) return;

    const errorBlock = renderErrorBlock(DATA.meta?.error);

    if (!virtualState.mode) virtualState.mode = 'menu';

    let content = '';

    if (virtualState.mode === 'clusters') {

      content = renderVirtualClusters();

    } else if (virtualState.mode === 'todos') {
      content = renderVirtualTodos();
    } else if (virtualState.mode === 'vsphere') {

      content = renderVirtualVsphere();

    } else if (virtualState.mode === 'clusterDetail') {

      content = renderVirtualClusterDetail();

    } else {

      content = renderVirtualMenu();

    }

    // Inventario + estado de monitoreo consolidado de todas las VMs
    const todasLasVms = (DATA.racks || []).flatMap((r) => r.servers || []);
    const leyenda = estadosMonitoreoCargados ? construirLeyendaHtml({ conteos: contarMonitoreo(todasLasVms, estadosMonitoreo), nota: 'Estado de monitoreo en vivo de las VMs (se actualiza cada 30 s)' }) : '';
    app.innerHTML = `${errorBlock}${leyenda}${content}`;



    // Actualizar visibilidad de botones del header

    updateHeaderButtons();



    try {

      app.classList.remove('fade-in');

      void app.offsetWidth;

      app.classList.add('fade-in');

    } catch (_) { }



    // Aplicar estilos visuales post-render para VMs filtradas

    applyVMVisualStyles();
    // Solo lectura también en los botones recién dibujados (p. ej. tras refrescar el monitoreo)
    disableReadOnlyActions();



    // Los eventos del detalle de cluster se conectan UNA vez, al final de renderVirtualView().
    // (Antes también se llamaba aquí y cada acción se ejecutaba dos veces.)



    // Wiring para botón de crear cluster en el menú

    if (isVirtuales && virtualState.mode === 'menu') {

      // Botón para crear nueva vista (aparece en el menú principal)

      const btnCreateView = document.getElementById('btnCreateView');

      btnCreateView?.addEventListener('click', async () => {
        if (isReadOnlyUser()) { showReadOnlyToast(); return; }

        const viewName = await pedirTexto({
          titulo: 'Nueva vista',
          etiqueta: 'Nombre de la nueva vista',
          mensaje: 'Agrupa hosts virtuales bajo un nombre (ej.: Power Systems, Hosts AIX).',
          textoAceptar: 'Crear',
          maxLength: 80,
        });

        if (!viewName || !viewName.trim()) return;



        const viewKey = viewName.trim()

          .toLowerCase()

          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')

          .replace(/[^a-z0-9]+/g, '-')

          .replace(/^-+|-+$/g, '');



        try {

          const res = await fetch('/api/clusters', {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({

              name: viewName.trim(),

              key: viewKey,

              type: 'view',  // type='view' para que aparezca en el menú principal

              description: 'Vista personalizada de hosts'

            })

          });

          const result = await res.json();

          if (!res.ok) {

            showToast(result.error || 'Error creando vista', 'error');

            return;

          }

          showToast('Vista creada correctamente');

          await fetchData();

          // Ir a la nueva vista

          showClusterDetail(viewKey);

        } catch (e) {

          console.error('Error creando vista:', e);

          showToast('Error de red creando vista', 'error');

        }





      });





      const appContainer = document.getElementById('app');

      if (appContainer) {



        const appContainer = document.getElementById('app');

        if (appContainer) {



          if (!appContainer.hasAttribute('data-events-wired')) {

            appContainer.setAttribute('data-events-wired', 'true');



            appContainer.addEventListener('click', async (e) => {

              // Delegación para botones de editar/eliminar vistas/clusters

              const editBtn = e.target.closest('.view-edit-btn');

              const deleteBtn = e.target.closest('.view-delete-btn');



              if (editBtn) {

                e.stopPropagation();

                const viewId = decodeURIComponent(editBtn.getAttribute('data-view-id') || '');

                const currentName = decodeURIComponent(editBtn.getAttribute('data-view-name') || '');

                const newName = await pedirTexto({ titulo: 'Renombrar vista', etiqueta: 'Nuevo nombre de la vista', valor: currentName, textoAceptar: 'Guardar', maxLength: 80 });

                if (!newName || !newName.trim() || newName.trim() === currentName) return;



                try {

                  const res = await fetch(`/api/clusters/${viewId}`, {

                    method: 'PUT',

                    headers: { 'Content-Type': 'application/json' },

                    body: JSON.stringify({ name: newName.trim() })

                  });

                  if (!res.ok) {

                    const result = await res.json();

                    showToast(result.error || 'Error actualizando vista', 'error');

                    return;

                  }

                  showToast('Vista actualizada');

                  await fetchData();

                } catch (err) {

                  console.error('Error actualizando vista:', err);

                  showToast('Error de red', 'error');

                }

              }



              if (deleteBtn) {

                e.stopPropagation();

                const viewId = decodeURIComponent(deleteBtn.getAttribute('data-view-id') || '');

                const viewName = decodeURIComponent(deleteBtn.getAttribute('data-view-name') || '');

                const accepted = await confirmAction({
                  title: 'Eliminar vista',
                  message: `¿Eliminar la vista "${viewName}"?`,
                  confirmText: 'Eliminar vista',
                  tone: 'danger'
                });
                if (!accepted) return;



                try {

                  const res = await fetch(`/api/clusters/${viewId}`, { method: 'DELETE' });

                  if (!res.ok) {

                    const result = await res.json();

                    showToast(result.error || 'Error eliminando vista', 'error');

                    return;

                  }

                  showToast('Vista eliminada');

                  await fetchData();

                } catch (err) {

                  console.error('Error eliminando vista:', err);

                  showToast('Error de red', 'error');

                }

              }

            });

          }

        }

      }

    }



    function wireClusterDetailEvents() {

      const clusterId = virtualState.clusterKey;

      const cluster = getClusterDefinition(clusterId);

      if (!cluster) return;



      // 1. Agregar Host al Cluster

      const btnAddHost = document.getElementById('btnAddHostToCluster');

      const selectHost = document.getElementById('clusterHostSelect');



      if (btnAddHost && selectHost) {

        btnAddHost.addEventListener('click', async () => {

          const rackId = selectHost.value;

          if (!rackId) return showToast('Por favor seleccione un host', 'warning');



          try {

            const res = await fetch(`/api/clusters/${cluster.id}/hosts`, {

              method: 'POST',

              headers: { 'Content-Type': 'application/json' },

              body: JSON.stringify({ rack_id: rackId })

            });



            if (!res.ok) {

              const result = await res.json();

              throw new Error(result.error || 'Error al agregar host');

            }



            showToast('Host agregado al clúster');

            await fetchData();

          } catch (e) {

            console.error(e);

            showToast('Error: ' + e.message, 'error');

          }

        });

      }



      // 2. Eliminar Cluster

      const btnDeleteCluster = document.getElementById('btnDeleteCluster');

      if (btnDeleteCluster) {

        btnDeleteCluster.addEventListener('click', async () => {

          const accepted = await confirmAction({
            title: 'Eliminar cluster',
            message: `¿Estas seguro de eliminar el cluster "${cluster.name}"? Esta accion no se puede deshacer.`,
            confirmText: 'Eliminar cluster',
            tone: 'danger'
          });
          if (!accepted) return;



          try {

            const res = await fetch(`/api/clusters/${cluster.id}`, { method: 'DELETE' });

            if (!res.ok) {

              const result = await res.json();

              throw new Error(result.error || 'Error al eliminar cluster');

            }



            showToast('Clúster eliminado correctamente');

            virtualState.mode = 'menu'; // Volver al menú

            await fetchData();

          } catch (e) {

            console.error(e);

            showToast('Error: ' + e.message, 'error');

          }

        });

      }



      // 3. Editar Cluster (Nombre)

      const btnEditCluster = document.getElementById('btnEditCluster');

      if (btnEditCluster) {

        btnEditCluster.addEventListener('click', async () => {

          const newName = await pedirTexto({ titulo: 'Renombrar clúster', etiqueta: 'Nuevo nombre del clúster', valor: cluster.name, textoAceptar: 'Guardar', maxLength: 80 });

          if (!newName || newName.trim() === cluster.name) return;



          try {

            const res = await fetch(`/api/clusters/${cluster.id}`, {

              method: 'PUT',

              headers: { 'Content-Type': 'application/json' },

              body: JSON.stringify({ name: newName.trim() })

            });



            if (!res.ok) {

              const result = await res.json();

              throw new Error(result.error || 'Error al actualizar clúster');

            }



            showToast('Clúster actualizado');

            await fetchData();

          } catch (e) {

            console.error(e);

            showToast('Error: ' + e.message, 'error');

          }

        });

      }



      // 4. Quitar Host del Cluster (Event Delegation en la lista)

      const hostList = document.querySelector('.cluster-host-admin__list');

      if (hostList) {

        hostList.addEventListener('click', async (e) => {

          const removeBtn = e.target.closest('[data-remove-rack-id]');
          if (removeBtn) {

            const rackId = decodeURIComponent(removeBtn.getAttribute('data-remove-rack-id') || '');

            if (!rackId) return;



            const accepted = await confirmAction({
              title: 'Quitar host del cluster',
              message: '¿Quitar este host del cluster?',
              confirmText: 'Quitar host',
              tone: 'danger'
            });
            if (!accepted) return;



            try {

              const res = await fetch(`/api/clusters/${cluster.id}/hosts/${rackId}`, {

                method: 'DELETE'

              });



              if (!res.ok) {

                const result = await res.json();

                throw new Error(result.error || 'Error al quitar host');

              }



              showToast('Host quitado del clúster');

              await fetchData();

            } catch (err) {

              console.error(err);

              showToast('Error: ' + err.message, 'error');

            }

          }

        });

      }

    }

    wireClusterDetailEvents();

  }



  function renderVirtualMenu() {

    // Combinar opciones estáticas con vistas dinámicas de la base de datos

    const staticOptions = VIRTUAL_GROUPS.menu.map(opt => `

    <button class="virtual-option" data-virtual-mode="${encodeURIComponent(opt.key)}">

      <span class="virtual-option__label">${opt.label}</span>

      <span class="virtual-option__desc">${opt.description}</span>

    </button>

  `);



    // Vistas dinámicas (clusters con type='view') con botones de editar/eliminar

    const dynamicViews = (virtualState.clusters || []).filter(c => c.type === 'view');

    const dynamicOptions = dynamicViews.map(v => `

    <div class="virtual-option-wrapper u-relativo">

      <button class="virtual-option" data-cluster-key="${encodeURIComponent(v.key || '')}" data-virtual-mode="clusterDetail">

        <span class="virtual-option__label">${fmt(v.name)}</span>

        <span class="virtual-option__desc">${fmt(v.description || 'Vista personalizada de hosts')}</span>

      </button>

      <div class="view-actions vista-acciones-flotantes">

        <button class="view-edit-btn btn-mini btn-mini--azul" data-view-id="${encodeURIComponent(v.id)}" data-view-name="${encodeURIComponent(v.name)}" title="Editar">✏️</button>

        <button class="view-delete-btn btn-mini btn-mini--rojo" data-view-id="${encodeURIComponent(v.id)}" data-view-name="${encodeURIComponent(v.name)}" title="Eliminar">🗑️</button>

      </div>

    </div>

  `);



    const allOptions = [...staticOptions, ...dynamicOptions].join('');



    return `

    <section class="virtual-menu">

      <div class="virtual-menu__header">

        <h2>Selecciona una vista</h2>

        <p class="muted">Elige cómo agrupar los hosts virtuales</p>

      </div>

      <div class="virtual-option-grid">

        ${allOptions}

      </div>

      <div class="virtual-menu__actions vista-acciones">

        <button id="btnCreateView" class="home-btn btn-color-verde btn-grande">

          ✨ Crear Nueva Vista

        </button>

      </div>

    </section>

  `;

  }



  function renderVirtualSubnav(title, mode = 'menu') {

    return `

    <div class="virtual-subnav">

      <button class="subnav-btn" data-virtual-mode="${encodeURIComponent(mode)}">← Volver</button>

      <h2>${fmt(title)}</h2>

    </div>

  `;

  }



  function renderVirtualHostCards(hosts, emptyMessage, options = { preview: true }) {

    if (!hosts || hosts.length === 0) return `<p class="virtual-empty">${fmt(emptyMessage)}</p>`;

    return hosts.map(h => renderVirtualHostCard(h, options)).join('');

  }



  function renderVirtualClusters() {

    const clusters = (virtualState.clusters || []).filter(c => c.type === 'cluster');

    const sections = clusters.map((group, idx) => {

      const hosts = getHostsForCluster(group.id);

      const cards = renderVirtualHostCards(hosts, 'No se encontraron hosts para este clúster.', { preview: true });

      return `

      <section class="cluster-section" role="button" tabindex="0" data-cluster-key="${encodeURIComponent(group.key || '')}" data-cluster="${encodeURIComponent(group.key || '')}" data-idx="${idx}">

        <header class="cluster-section__header">

          <div class="u-flex-1">

            <h2>${fmt(group.name)}</h2>

            <p class="muted">${fmt(hosts.map(h => h.name).join(', ') || 'Sin hosts asignados')}</p>
            ${resumenMonitoreoHtml(hosts.flatMap((h) => h.servers || []), { titulo: 'Monitoreo del clúster' })}

          </div>

          <div class="virtual-option-actions">

             <button class="view-edit-btn" data-view-id="${encodeURIComponent(group.id)}" data-view-name="${encodeURIComponent(group.name)}" title="Editar nombre">✏️</button>

             <button class="view-delete-btn" data-view-id="${encodeURIComponent(group.id)}" data-view-name="${encodeURIComponent(group.name)}" title="Eliminar clúster">🗑️</button>

          </div>

        </header>

        <div class="cluster-hosts">

          ${cards}

        </div>

        <footer class="cluster-section__footer">

          <button class="cluster-detail-btn" data-cluster-key="${encodeURIComponent(group.key || '')}">Ver detalle del clúster</button>

        </footer>

      </section>

    `;

    }).join('');

    return `

    ${renderVirtualSubnav('Clusters Danec')}

    <div class="cluster-container">

      ${sections}

    </div>

  `;

  }



  /** Todos los hosts del inventario (incluidos los que no están en ningún clúster) y las VMs sin host */
  function renderVirtualTodos() {
    const hosts = DATA.racks || [];
    const sinHost = (DATA.servers || []).filter((s) => s.rackId == null || s.rackId === '');
    return `
    ${renderVirtualSubnav('Todos los hosts')}
    <div class="cluster-container cluster-container--todos">
      <section class="cluster-section cluster-section--todos">
        <header class="cluster-section__header">
          <div>
            <h3>${hosts.length} hosts · ${(DATA.servers || []).length} VMs</h3>
            ${resumenMonitoreoHtml(DATA.servers || [], { titulo: 'Monitoreo de todas las VMs' })}
          </div>
        </header>
        <div class="cluster-hosts">${renderVirtualHostCards(hosts, 'No hay hosts virtuales registrados.', { preview: true })}</div>
      </section>
      ${construirSinRackHtml(sinHost, estadosMonitoreo, { titulo: 'VMs sin host asignado', descripcion: 'Máquinas virtuales del inventario sin host. Ábrelas y edítalas para asignarles un host.', unidad: 'VMs' })}
    </div>
  `;
  }

  function renderVirtualVsphere() {

    const vsphereCluster = (virtualState.clusters || []).find(c => c.type === 'vsphere');

    if (!vsphereCluster) {

      return `

      ${renderVirtualSubnav('VMware vSphere')}

      <div class="cluster-container">

        <p class="virtual-empty">No se encontró configuración de cluster vSphere.</p>

      </div>

    `;

    }

    const hostList = getHostsForCluster(vsphereCluster.id);

    const cards = renderVirtualHostCards(hostList, 'No se encontraron hosts configurados para VMware vSphere.', { preview: true });

    return `

    ${renderVirtualSubnav(vsphereCluster.name)}

    <div class="cluster-container">

      <section class="cluster-section" role="button" tabindex="0" data-cluster-key="${encodeURIComponent(vsphereCluster.key || '')}" data-cluster="${encodeURIComponent(vsphereCluster.key || '')}">

        <header class="cluster-section__header">

          <div>

            <h3>Hosts asignados</h3>

            <p class="muted">${fmt(hostList.map(h => h.name).join(', ') || 'Sin hosts asignados')}</p>

          </div>

        </header>

        <div class="cluster-hosts">

          ${cards}

        </div>

        <footer class="cluster-section__footer">

          <button class="cluster-detail-btn" data-cluster-key="${encodeURIComponent(vsphereCluster.key || '')}">Ver detalle completo</button>

        </footer>

      </section>

    </div>

  `;

  }



  function renderVirtualClusterDetail() {

    const cluster = getClusterDefinition(virtualState.clusterKey);

    if (!cluster) {

      virtualState.mode = 'menu';

      return renderVirtualMenu();

    }

    const hosts = getHostsForCluster(cluster.id);

    const cards = renderVirtualHostCards(hosts, 'No se encontraron hosts para este clúster.', { preview: false });

    const backMode = cluster.source === 'vsphere' ? 'vsphere' : (cluster.type === 'view' ? 'menu' : 'clusters');

    const totalVMs = hosts.reduce((acc, host) => acc + (host?.servers?.length || 0), 0);

    return `

    ${renderVirtualSubnav(cluster.name, backMode)}

    <section class="cluster-detail" data-source="${escapeHtml(cluster.source)}" data-cluster="${encodeURIComponent(cluster.key || '')}">

      <header class="cluster-detail__header">

        <div>

          <p class="muted">Hosts: ${fmt(hosts.map(h => h.name).join(', ') || 'Sin hosts asignados')}</p>

          <span class="cluster-detail__stats">${hosts.length} hosts · ${totalVMs} VMs</span>

        </div>

        <div class="cluster-admin-actions">

          <button class="home-btn" id="btnEditCluster">Editar clúster</button>

          <button class="home-btn btn-color-rojo" id="btnDeleteCluster">Eliminar clúster</button>

        </div>

      </header>

      <div class="cluster-detail__hosts">

        ${cards}

      </div>

      <footer class="cluster-detail__footer">

        <div class="cluster-host-admin">

          <h3>Gestión de hosts del clúster</h3>

          <div class="cluster-host-admin__row">

            <label for="clusterHostSelect">Agregar host existente</label>

            <select id="clusterHostSelect">

              <option value="">Seleccione un host...</option>

              ${(DATA.racks || [])

        .filter(r =>

          !hosts.some(h => h.id === r.id) &&

          r.type === 'virtuales' &&

          !r.name.toLowerCase().includes('power 10') && // Filter test data

          !r.name.toLowerCase().includes('power 100')

        )

        .map(r => `<option value="${r.id || ''}">${fmt(r.name)}</option>`).join('')}

            </select>

            <button id="btnAddHostToCluster" class="home-btn btn btn-primary">Agregar al clúster</button>

          </div>

          <div class="cluster-host-admin__list">

            <h4>Hosts asignados</h4>

            <ul class="cluster-assigned-hosts">

              ${hosts.map(h => `<li class="cluster-assigned-host" data-rack-id="${encodeURIComponent(h.id || '')}"><span class="cluster-assigned-host__name">${fmt(h.name)}</span><button class="btn btn-danger btn-sm" data-remove-rack-id="${encodeURIComponent(h.id || '')}">Quitar</button></li>`).join('') || '<li class="muted">No hay hosts asignados</li>'}

            </ul>

          </div>

        </div>

      </footer>

    </section>

  `;

  }



  function getHostsByNames(names = []) {

    const targets = new Set(names.map(n => n.toUpperCase()));

    return (DATA.racks || []).filter(host => targets.has((host?.name || '').toString().trim().toUpperCase()));

  }



  function getHostsForCluster(clusterId) {

    const links = virtualState.clusterHostsById?.[clusterId] || [];

    const racks = [];

    links.forEach(link => {

      let rack = virtualState.rackById[link.rack_id];

      if (!rack && link.rack_name) {

        rack = virtualState.rackById[link.rack_name] || (DATA.racks || []).find(r => r.name === link.rack_name);

      }

      if (rack) racks.push(rack);

    });

    return racks;

  }



  /** Estado de monitoreo consolidado de un conjunto de VMs (y opcionalmente del host físico) */
  function resumenMonitoreoHtml(vms, { hostNombre = null, titulo = 'Monitoreo' } = {}) {
    const conteos = contarMonitoreo(vms, estadosMonitoreo);
    const partes = Object.entries(ESTADOS_MONITOREO)
      .filter(([k]) => conteos[k])
      .map(([k, m]) => `<span class="estado-consolidado__item" title="${escapeHtml(m.descripcion)}"><span class="gab-led gab-led--${m.clase}" aria-hidden="true"></span>${conteos[k]} ${escapeHtml(m.texto)}</span>`);
    let host = '';
    if (hostNombre) {
      const clave = estadosHostPorNombre.get(String(hostNombre).toLowerCase());
      if (clave) {
        const m = ESTADOS_MONITOREO[claveMonitoreo(clave)];
        host = `<span class="estado-consolidado__item estado-consolidado__host" title="Estado del host"><span class="gab-led gab-led--${m.clase}" aria-hidden="true"></span>Host ${escapeHtml(m.texto)}</span>`;
      }
    }
    if (!partes.length && !host) return '';
    return `<div class="estado-consolidado" aria-label="${escapeHtml(titulo)}">${host}${partes.length ? `<span class="estado-consolidado__titulo">VMs:</span>${partes.join('')}` : ''}</div>`;
  }

  function renderVirtualHostCard(host, options = {}) {

    const { preview = false } = options;

    let serverList = [...(host?.servers || [])];

    const vmCount = serverList.length;



    // Visualización de VMs

    const vmFilter = virtualState.vmFilter || 'all';

    const vmSearch = (virtualState.vmSearch || '').toLowerCase().trim();



    const vmMatchesFilter = (vm) => {

      const estado = normalizeEstado(vm.estado || '');

      if (vmFilter !== 'all') {
        if (vmFilter === 'no_critico') {
          if (estado === 'critico' || estado === 'mantenimiento') return false;
        } else if (estado !== vmFilter) {
          return false;
        }
      }

      if (vmSearch) {

        const fields = [vm.hostname, vm.nombre, vm.ip, vm.so].map(x => (x || '').toLowerCase()).join(' ');

        if (!fields.includes(vmSearch)) return false;

      }

      return true;

    };



    // Contar cuántas VMs coinciden con el filtro

    const matchingVMs = serverList.filter(vmMatchesFilter);

    const nonMatchingVMs = serverList.filter(vm => !vmMatchesFilter(vm));

    const hasActiveFilter = vmFilter !== 'all' || vmSearch;



    // Si hay búsqueda/filtro activo, reordenar para que las VMs que coinciden aparezcan primero

    if (hasActiveFilter && matchingVMs.length > 0) {

      serverList = [...matchingVMs, ...nonMatchingVMs];

    }



    // Si hay filtro activo, mostrar todas las VMs que coinciden (o hasta un límite mayor)

    const effectiveLimit = hasActiveFilter

      ? Math.max(VIRTUAL_PREVIEW_LIMIT, matchingVMs.length)

      : VIRTUAL_PREVIEW_LIMIT;



    const visibleList = preview ? serverList.slice(0, effectiveLimit) : serverList;

    const overflowCount = preview ? Math.max(0, vmCount - visibleList.length) : 0;



    let vmButtons = '';

    for (const vm of visibleList) {

      const estado = normalizeEstado(vm.estado || '');

      const st = estado === 'critico' ? 'crit' : (estado === 'activo' ? 'ok' : (estado === 'normal' ? 'ok' : 'other'));

      const label = fmt(vm.nombre || vm.hostname || vm.ip);

      const id = fmt(vm.id);

      const isMatch = vmMatchesFilter(vm);

      const dimClass = hasActiveFilter && !isMatch ? 'vm-dimmed' : '';

      const matchClass = hasActiveFilter && isMatch ? 'vm-match' : '';



      const tooltipText = [

        `Nombre: ${fmt(vm.nombre || vm.hostname)}`,

        `IP: ${fmt(vm.ip)}`,

        `SO: ${fmt(vm.so)}`,

        `Estado: ${fmt(vm.estado)}`

      ].join('\n');

      const tooltipAttr = tooltipText

        .replace(/&/g, '&amp;')

        .replace(/</g, '&lt;')

        .replace(/>/g, '&gt;')

        .replace(/"/g, '&quot;')

        .replace(/'/g, '&#39;')

        .replace(/\n/g, '&#10;');



      vmButtons += `

          <button class="vm-node status-${st} ${dimClass} ${matchClass}" data-view="server" data-id="${encodeURIComponent(vm.id)}" data-tooltip="${tooltipAttr}" data-estado="${estado}">

            <svg class="pc-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">

              <defs>

                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">

                  <stop offset="0%" stop-color="#f8fafc"></stop>

                  <stop offset="100%" stop-color="#e2e8f0"></stop>

                </linearGradient>

              </defs>

              <rect x="6" y="10" width="52" height="36" rx="6" fill="url(#g1)" stroke="#cbd5e1"></rect>

              <rect x="10" y="14" width="44" height="24" rx="3" fill="#0f172a"></rect>

              <rect x="8" y="48" width="48" height="6" rx="3" fill="#cbd5e1"></rect>

              <circle cx="54" cy="38" r="3" fill="var(--vm-color)"></circle>

            </svg>

            <span class="gab-led gab-led--${ESTADOS_MONITOREO[claveMonitoreo(estadosMonitoreo.get(String(vm.id)))].clase} vm-led" data-led-id="${escapeHtml(String(vm.id))}" aria-hidden="true"></span>
            <span class="vm-num">${id}</span>

            <span class="vm-label">${label}</span>

          </button>

        `;

    }



    // Mostrar badge de resultados si hay filtro activo

    const matchInfo = hasActiveFilter ? `<div class="vm-match-info">${matchingVMs.length} de ${vmCount} VMs coinciden</div>` : '';

    const gridContent = vmButtons || `<div class="virtual-empty">Sin máquinas virtuales registradas.</div>`;

    const overflowBadge = overflowCount > 0 ? `<div class="vm-overflow">+${overflowCount} VMs adicionales</div>` : '';



    return `

        <article class="host-card ${hasActiveFilter && matchingVMs.length === 0 ? 'host-no-matches' : ''}" data-view="rack" data-name="${encodeURIComponent(host.name)}" title="Ver detalle de ${fmt(host.name)}">

          <header class="host-card__header">

            <div class="host-card__title">

              <span class="host-card__icon" aria-hidden="true">🖥️</span>

              <div>

                <h3>${fmt(host.name)}</h3>

                <span class="host-card__meta">${vmCount} VMs activas</span>
                ${resumenMonitoreoHtml(host?.servers || [], { hostNombre: host?.name })}

              </div>

            </div>

            <button class="btn-edit-host btn-mini btn-mini--azul u-mr-8" data-host-id="${encodeURIComponent(String(host.id ?? ''))}" data-host-name="${encodeURIComponent(host.name)}" title="Editar nombre del host">✏️ Editar</button>

            <span class="host-card__count">${vmCount} VMs</span>

          </header>

          <div class="host-card__body">

            ${matchInfo}

            <div class="vm-grid" aria-label="Lista de VMs de ${fmt(host.name)}">

              ${gridContent}

            </div>

            ${overflowBadge}

          </div>

        </article>

      `;

  }



  function resolveRack({ idx, name }) {

    const racks = DATA.racks || [];

    if (idx != null) {

      const i = Number(idx);

      if (!Number.isNaN(i) && i >= 0 && i < racks.length) return racks[i];

    }

    if (name != null) {

      const rackName = decodeURIComponent(name);

      const r = racks.find(r => r.name === rackName);

      if (r) return r;

    }

    return null;

  }



  function renderRackByParams({ idx, name }) {

    const rack = resolveRack({ idx, name });

    if (!rack) return renderHome();

    // Oculta el panel de overview en la vista de detalle

    try { document.getElementById('overview').style.display = 'none'; } catch (_) { }



    // Show content and hide loading

    const loadingEl = document.getElementById('loading');

    const contentEl = document.getElementById('content');

    if (loadingEl) loadingEl.style.display = 'none';

    if (contentEl) contentEl.style.display = 'block';



    // Guardar el host actual para agregar VMs directamente

    virtualState.currentRackName = rack.name;

    const itemServidor = (s) => {
      const crit = normalizeEstado(s.estado || s.activo || '');
      const mon = ESTADOS_MONITOREO[claveMonitoreo(estadosMonitoreo.get(String(s.id)))];
      const estadoHtml = isVirtuales
        ? fmt(s.estado)
        : `<span class="gab-crit gab-crit--${crit.replace('_', '-')}" aria-hidden="true"></span>${escapeHtml(CRITICIDADES[crit].texto)}`;
      const ledHtml = isVirtuales ? ''
        : `<div class="server-led-linea"><span class="gab-led gab-led--${mon.clase}" data-led-id="${escapeHtml(String(s.id))}" aria-hidden="true"></span>Monitoreo: <span data-led-texto="${escapeHtml(String(s.id))}">${escapeHtml(mon.texto)}</span></div>`;
      return `
          <div class="server-item" draggable="true" title="IP: ${fmt(s.ip)}&#10;Hostname: ${fmt(s.nombre || s.hostname)}&#10;Arrastrar para mover a otro rack">
            <div class="server-info u-flex-1 u-puntero" data-view="server" data-id="${encodeURIComponent(s.id)}">
              <div class="server-name">${fmt(s.nombre || s.hostname)}</div>
              <div class="server-ip">${fmt(s.ip)}</div>
              <div class="server-model">${fmt(s.marca)} ${fmt(s.modelo)}</div>
              ${ledHtml}
            </div>
            <div class="server-status ${statusClass(s.estado)}">
              ${estadoHtml}
            </div>
            <div class="u-fila-gap-5">
              <button class="server-btn-edit" data-server-id="${encodeURIComponent(s.id)}" title="Editar servidor">✏️</button>
              <button class="server-btn-delete" data-server-id="${encodeURIComponent(s.id)}" data-server-name="${encodeURIComponent(s.hostname || s.nombre || '')}" title="Eliminar servidor">🗑️</button>
            </div>
          </div>`;
    };
    const listaHtml = `<div class="rack-servers-list">${rack.servers.map(itemServidor).join('')}</div>`;
    // Físicos: el rack dibujado como gabinete (cada servidor en su U) junto a la lista del inventario
    let cuerpoHtml = listaHtml;
    let ocupacionHtml = '';
    if (!isVirtuales) {
      const gab = construirGabineteHtml({
        nombreRack: rack.name,
        servidores: rack.servers,
        estados: estadosMonitoreo,
        grande: true,
        detalle: true,
        numeracionAscendente: /^rack\s*1$/i.test((rack.name || '').trim()),
      });
      ocupacionHtml = ` · ${gab.ocupadas}/42U ocupadas · ${gab.libres}U libres`;
      cuerpoHtml = `<div class="rack-detail__cuerpo">
        <div class="rack-detail__gab">${gab.html}</div>
        <div>${construirAvisoSinUbicarHtml(gab.sinUbicar, estadosMonitoreo)}${listaHtml}${construirLeyendaHtml()}</div>
      </div>`;
    }

    app.innerHTML = `
    <div class="scrollable">
    ${renderErrorBlock(DATA.meta?.error)}
    <div class="rack-detail ${isVirtuales ? '' : 'rack-detail--gab'}" data-rack-name="${encodeURIComponent(rack.name)}">
      <div class="rack-detail-header">
        <h2>${fmt(rack.name)}</h2>
        <div class="muted">${rack.servers.length} servidores${ocupacionHtml}</div>
        <div class="u-fila-gap-10">
          ${isVirtuales ? `<button id="btnAddVMToHost" class="home-btn btn-color-verde" title="Agregar VM a este host">➕ Agregar VM</button>` : ''}
          <button id="btnDeleteRack" class="home-btn btn-color-rojo" title="Eliminar rack">🗑️ Eliminar Rack</button>
          <button id="btnBackRackDetail" class="back-btn">← Volver</button>
        </div>
      </div>
      ${cuerpoHtml}
    </div>
    </div>
  `;

    // Agregar event listeners para los botones de editar y eliminar

    document.querySelectorAll('.server-btn-edit').forEach(btn => {

      btn.addEventListener('click', (e) => {

        e.stopPropagation();

        if (isReadOnlyUser()) {
          showReadOnlyToast();
          return;
        }

        const serverId = decodeURIComponent(btn.getAttribute('data-server-id') || '');

        const server = rack.servers.find(s => String(s.id) === String(serverId));

        if (window.serverManager && server) {

          window.serverManager.openServerModalForEdit(server);

        }

      });

    });



    document.querySelectorAll('.server-btn-delete').forEach(btn => {

      btn.addEventListener('click', (e) => {

        e.stopPropagation();

        if (isReadOnlyUser()) {
          showReadOnlyToast();
          return;
        }

        const serverId = decodeURIComponent(btn.getAttribute('data-server-id') || '');

        const serverName = decodeURIComponent(btn.getAttribute('data-server-name') || '');

        if (window.serverManager) {

          window.serverManager.deleteServer(serverId, serverName);

        }

      });

    });



    // Event listener para agregar VM a este host (solo en virtuales)

    const btnAddVMToHost = document.getElementById('btnAddVMToHost');

    if (btnAddVMToHost && isVirtuales) {

      btnAddVMToHost.addEventListener('click', () => {

        if (isReadOnlyUser()) {
          showReadOnlyToast();
          return;
        }

        openServerModal(rack.name); // Pasa el nombre del rack para preseleccionarlo

      });

    }

    const btnBackRackDetail = document.getElementById('btnBackRackDetail');
    btnBackRackDetail?.addEventListener('click', () => {
      location.hash = '';
    });



    // Event listener para eliminar rack

    const btnDeleteRack = document.getElementById('btnDeleteRack');

    if (btnDeleteRack) {

      btnDeleteRack.addEventListener('click', async () => {

        if (isReadOnlyUser()) {
          showReadOnlyToast();
          return;
        }

        if (!rack.name) {

          showToast('No se puede identificar el rack a eliminar', 'error');

          return;

        }



        const confirmMsg = rack.servers.length > 0

          ? `¿Estás seguro de eliminar el rack "${rack.name}"?\n\nEste rack contiene ${rack.servers.length} servidor(es).\n¡ADVERTENCIA! Se eliminarán TODOS los servidores del rack.`

          : `¿Estás seguro de eliminar el rack vacío "${rack.name}"?`;



        const accepted = await confirmAction({
          title: 'Eliminar rack',
          message: confirmMsg,
          confirmText: 'Eliminar rack',
          tone: 'danger'
        });
        if (!accepted) {

          return;

        }



        try {

          // Buscar el ID del rack en la base de datos

          const racksResponse = await fetch('/api/data?type=' + (window.location.pathname.includes('virtuales') ? 'virtuales' : 'fisicos'));

          const data = await racksResponse.json();

          const rackData = data.racks.find(r => r.name === rack.name);



          if (!rackData) {

            showToast('No se pudo encontrar el rack en la base de datos', 'error');

            return;

          }


          // Como el endpoint /api/racks no devuelve ID, hacer una petición especial

          // Usar el nombre para eliminar

          const forceParam = rack.servers.length > 0 ? '?force=true' : '';

          const response = await fetch(`/api/racks/by-name/${encodeURIComponent(rack.name)}${forceParam}`, {

            method: 'DELETE'

          });



          const result = await response.json();



          if (response.ok) {

            showToast('Rack eliminado exitosamente', 'success');

            location.hash = '';

            if (window.loadAllData) {

              window.loadAllData();

            } else {

              location.reload();

            }

          } else {

            showToast('Error: ' + (result.error || 'No se pudo eliminar el rack'), 'error');

          }

        } catch (error) {

          console.error('Error eliminando rack:', error);

          showToast('Error de conexión al eliminar el rack', 'error');

        }

      });

    }

  }



  function serverCard(s) {

    const header = `<h3>${fmt(s.nombre || s.hostname)} <span class="muted">(${fmt(s.ip)})</span></h3>`;
    let indicadores = '';
    if (!isVirtuales) {
      // Criticidad de inventario y LED de monitoreo (mismos símbolos que el rack)
      const crit = normalizeEstado(s.estado || s.activo || '');
      const mon = ESTADOS_MONITOREO[claveMonitoreo(estadosMonitoreo.get(String(s.id)))];
      indicadores = `<div class="ficha-indicadores"><span><span class="gab-crit gab-crit--${crit.replace('_', '-')}" aria-hidden="true"></span>Criticidad: ${escapeHtml(CRITICIDADES[crit].texto)}</span><span><span class="gab-led gab-led--${mon.clase}" data-led-id="${escapeHtml(String(s.id))}" aria-hidden="true"></span>Monitoreo: <span data-led-texto="${escapeHtml(String(s.id))}">${escapeHtml(mon.texto)}</span></span></div>`;
    }

    return `

    <div class="card" data-view="server" data-id="${encodeURIComponent(s.id)}">

      ${header}
      ${indicadores}

      <div class="kv">

        <div>Rack</div><div>${fmt(s.rack)}</div>

        <div>Usuario</div><div>${fmt(s.usuario)}</div>

        <div>Marca</div><div>${fmt(s.marca)}</div>

        <div>Modelo</div><div>${fmt(s.modelo)}</div>

        <div>Tipo</div><div>${fmt(s.tipo)}</div>

        <div>Serie</div><div>${fmt(s.serie)}</div>

        <div>Socket</div><div>${fmt(s.socket)}</div>

        <div>No. por socket</div><div>${fmt(s.noPorSocket)}</div>

        <div>Proc. lógicos</div><div>${fmt(s.procesadoresLogicos)}</div>

        <div>RAM</div><div>${fmt(s.ramGb)}</div>

        <div>Discos</div><div class="u-pre-wrap">${fmt(formatDiscosDisplay(s.discos))}</div>

        <div>Datastore</div><div class="u-pre-wrap">${fmt(s.datastore)}</div>

        <div>Conexión</div><div class="u-pre-wrap">${fmt(s.conexion)}</div>

        <div>Software</div><div>${fmt(s.software)}</div>

        <div>SO</div><div>${fmt(s.so)}</div>

        <div>Instalación</div><div>${fmt(s.fechaInstalacion)}</div>

        <div>Mantenimiento</div><div>${fmt(s.fechaMantenimiento)}</div>

        <div>Estado</div><div>${fmt(s.estado)}</div>

        <div>Backup</div><div>${fmt(s.backup)}</div>

        <div>Fecha backup</div><div>${fmt(s.fechaBackup)}</div>

        <div>Activo</div><div>${fmt(s.activo)}</div>

      </div>

    </div>

  `;

  }



  function renderServer(id) {

    const sid = decodeURIComponent(id);

    const s = DATA.servers.find(x => String(x.id) === String(sid));

    if (!s) return renderHome();



    // Show content and hide loading

    const loadingEl = document.getElementById('loading');

    const contentEl = document.getElementById('content');

    if (loadingEl) loadingEl.style.display = 'none';

    if (contentEl) contentEl.style.display = 'block';



    // CRUD buttons now available on both pages

    const crudButtons = `

    <button class="home-btn btn-color-azul u-ml-10" id="btnEditServer">✏️ Editar</button>

    <button class="home-btn btn-color-rojo-oscuro u-ml-10" id="btnDeleteServer">🗑️ Eliminar</button>

  `;



    const back = `<div class="u-fila-derecha"><button class="back-btn" id="btnBackView">← Volver</button>${crudButtons}</div>`;

    app.innerHTML = `<div class="scrollable">${renderErrorBlock(DATA.meta?.error)}${back}${serverCard(s)}</div>`;

    document.getElementById('btnBackView')?.addEventListener('click', () => {

      if (navegacionesInternas > 0) history.back(); else location.hash = '';

    });



    // Add edit/delete event listeners

    document.getElementById('btnEditServer')?.addEventListener('click', () => {

      if (isReadOnlyUser()) {
        showReadOnlyToast();
        return;
      }

      console.log('Edit button clicked, server:', s, 'serverManager:', window.serverManager);

      if (window.serverManager) {

        window.serverManager.openServerModalForEdit(s);

      } else {

        showToast('Error: El gestor de servidores no está disponible', 'error');

      }

    });



    document.getElementById('btnDeleteServer')?.addEventListener('click', async () => {

      if (isReadOnlyUser()) {
        showReadOnlyToast();
        return;
      }

      const accepted = await confirmAction({
        title: 'Eliminar servidor',
        message: `¿Eliminar el servidor "${s.nombre || s.hostname}"?`,
        confirmText: 'Eliminar servidor',
        tone: 'danger'
      });
      if (!accepted) return;

      try {

        const res = await fetch(`/api/servers/${s.id}`, { method: 'DELETE' });

        const result = await res.json();

        if (res.ok) {

          showToast('Servidor eliminado correctamente');

          await fetchData();

          location.hash = '';

        } else {

          showToast(result.error || 'Error eliminando servidor', 'error');

        }

      } catch (err) {

        console.error('Error eliminando servidor:', err);

        showToast('Error de conexión al eliminar', 'error');

      }

    });

  }



  function route() {

    console.log('Route called, hash:', location.hash);

    const hash = location.hash.slice(1);

    if (!hash) {

      console.log('No hash, rendering home with', DATA.racks ? DATA.racks.length : 0, 'racks');

      return renderHome();

    }

    const params = new URLSearchParams(hash);

    const view = params.get('view');

    // Vista de detalle de rack disponible en ambas páginas (físicos y virtuales)

    if (view === 'rack') {

      renderRackByParams({ idx: params.get('idx'), name: params.get('name') });
      return ejecutarAccionInventario(params);

    }

    if (view === 'server') {
      renderServer(params.get('id'));
      return ejecutarAccionInventario(params);
    }

    renderHome();

  }

  /**
   * Accesos directos por URL: abren el MISMO formulario de
   * alta/edición de esta página. `#view=server&id=N&accion=editar` edita el servidor;
   * `#view=rack&name=R&accion=agregar&posicion=P` abre el alta con el rack y la posición U.
   * La acción se consume una sola vez (se quita del hash) para que un refresco no la repita.
   */
  async function ejecutarAccionInventario(params) {
    const accion = params.get('accion');
    if (!accion) return;
    const limpio = new URLSearchParams(params);
    limpio.delete('accion');
    limpio.delete('posicion');
    history.replaceState(null, '', `${location.pathname}${location.search}#${limpio.toString()}`);
    if (isReadOnlyUser()) { showReadOnlyToast(); return; }
    const gestor = window.serverManager;
    if (!gestor) return;
    if (accion === 'editar' && params.get('id')) {
      // Mismo objeto que usa el botón Editar de la ficha (con todos sus campos)
      const servidor = (DATA.servers || []).find((x) => String(x.id) === String(params.get('id')));
      await gestor.openServerModalForEdit(servidor || params.get('id'));
    } else if (accion === 'agregar' && params.get('name')) {
      await gestor.openServerModal(params.get('name'));
      const posicion = Number(params.get('posicion'));
      const campo = document.getElementById('serverPosition');
      if (campo && Number.isInteger(posicion) && posicion >= 1 && posicion <= 42) campo.value = String(posicion);
    }
  }



  window.addEventListener('click', (e) => {

    if (isReadOnlyUser()) {
      const restricted = e.target.closest('[data-view], [data-cluster-key], [data-virtual-mode]');
      if (restricted) {
        e.preventDefault();
        e.stopPropagation();
        showReadOnlyToast();
        return;
      }
    }

    if (isVirtuales) {

      if (e.target.closest('.view-edit-btn, .view-delete-btn')) {
        return;
      }

      const clusterTrigger = e.target.closest('[data-cluster-key]');
      // Una VM o un host dentro de la tarjeta del clúster abren su propia vista, no la del clúster
      const vistaInterna = e.target.closest('[data-view]');

      if (clusterTrigger && !(vistaInterna && clusterTrigger.contains(vistaInterna))) {

        e.preventDefault();

        e.stopPropagation();

        const key = decodeURIComponent(clusterTrigger.getAttribute('data-cluster-key') || '');

        if (!key) return;

        showClusterDetail(key);

        return;

      }

    }

    const virtualBtn = e.target.closest('[data-virtual-mode]');

    if (virtualBtn && isVirtuales) {

      const mode = decodeURIComponent(virtualBtn.getAttribute('data-virtual-mode') || '');

      changeVirtualMode(mode);

      return;

    }

    const el = e.target.closest('[data-view]');

    if (!el) return;

    const view = el.getAttribute('data-view');

    if (view === 'rack') {

      const name = el.getAttribute('data-name');

      const idx = el.getAttribute('data-idx');

      const idxPart = idx != null ? `&idx=${idx}` : '';

      location.hash = `view=rack&name=${name}${idxPart}`;

    } else if (view === 'server') {

      const id = el.getAttribute('data-id');

      location.hash = `view=server&id=${id}`;

    }

  });

  window.addEventListener('keydown', (e) => {
    if (!isVirtuales) return;

    if (isReadOnlyUser()) {
      const clusterSection = e.target.closest('.cluster-section[role="button"][data-cluster-key]');
      if (clusterSection && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        showReadOnlyToast();
        return;
      }
    }

    if (e.key !== 'Enter' && e.key !== ' ') return;

    const tag = (e.target?.tagName || '').toLowerCase();
    if (['button', 'input', 'select', 'textarea', 'a'].includes(tag)) return;

    const clusterSection = e.target.closest('.cluster-section[role="button"][data-cluster-key]');
    if (!clusterSection) return;

    e.preventDefault();
    const key = decodeURIComponent(clusterSection.getAttribute('data-cluster-key') || '');
    if (!key) return;
    showClusterDetail(key);
  });



  btnInicio?.addEventListener('click', async () => {

    // Volver a la vista general y volver a consultar los datos (y el estado de monitoreo)

    location.hash = '';

    await fetchData();

    showToast('Datos recargados manualmente');

  });



  function setUpdatedAt() {

    updatedAtEl.textContent = DATA.meta?.updatedAt ? `Última actualización: ${new Date(DATA.meta.updatedAt).toLocaleString()}` : '';

  }



  // Detectar el tipo de servidor basado en la URL

  function getServerType() {

    const path = window.location.pathname;

    if (path.includes('/virtuales')) return 'virtuales';

    if (path.includes('/fisicos')) return 'fisicos';

    return 'fisicos'; // Por defecto

  }



  async function fetchData() {

    const serverType = getServerType();

    // apiFetch: tiempo de espera + redirección a /login si la sesión expiró (Fase 4.2)
    const res = await apiFetch(`/api/data?type=${encodeURIComponent(serverType)}`);

    DATA = await res.json();



    if (serverType === 'virtuales') {

      try {

        const clusters = await apiJson('/api/clusters');

        virtualState.clusters = Array.isArray(clusters) ? clusters : [];



        // Construir índices para racks por id y cluster-hosts

        virtualState.rackById = {};

        (DATA.racks || []).forEach(r => {

          if (r.id != null) {

            virtualState.rackById[r.id] = r;

          } else {

            // fallback por nombre si no hay id

            virtualState.rackById[r.name] = r;

          }

        });



        // Hosts de TODOS los clústeres en paralelo (antes: una petición tras otra, N+1 en serie).
        // Si un clúster falla, los demás se muestran igual (allSettled).
        const hostsByCluster = {};
        const resultados = await Promise.allSettled(
          virtualState.clusters.map((cluster) => apiJson(`/api/clusters/${encodeURIComponent(cluster.id)}/hosts`))
        );
        resultados.forEach((resultado, i) => {
          if (resultado.status === 'fulfilled') {
            const ch = resultado.value;
            hostsByCluster[virtualState.clusters[i].id] = Array.isArray(ch) ? ch : [];
          }
        });

        virtualState.clusterHostsById = hostsByCluster;

      } catch (_) { }

    }

    console.log(`Datos cargados para ${serverType}:`, DATA);

    console.log(`Racks encontrados: ${DATA.racks ? DATA.racks.length : 0}`);

    console.log(`Servidores encontrados: ${DATA.servers ? DATA.servers.length : 0}`);

    if (DATA.racks && DATA.racks.length > 0) {

      console.log('Primer rack:', DATA.racks[0]);

    }

    setUpdatedAt();

    // Mostrar toast si la fecha de actualización cambió (evitar en la primera carga)

    const newUpdatedAt = DATA?.meta?.updatedAt;

    if (lastUpdatedAt && newUpdatedAt && String(newUpdatedAt) !== String(lastUpdatedAt)) {

      const label = serverType === 'virtuales' ? 'virtuales' : 'físicos';

      showToast(`Datos de ${label} actualizados`);

    }

    if (newUpdatedAt) lastUpdatedAt = newUpdatedAt;

    route();
    cargarEstadosMonitoreo();

    // Re-aplicar el modo solo lectura a los botones recién renderizados
    disableReadOnlyActions();

    // (El resumen de racks lo dibuja wirePhysicalUX() dentro de route(); aquí había una llamada
    // a renderOverview() fuera de su alcance que fallaba en silencio: ReferenceError.)

  }

  // Live updates via SSE (solo si existe #app)

  try {

    if (document.getElementById('app')) {

      const ev = new EventSource('/events');

      // Referencia global para cerrarla al hacer logout (ver nav.js / auth.js)
      window.__eventosServidor = ev;

      ev.addEventListener('data', async (msg) => {

        try {

          // El servidor transmite todo el cache (físicos + virtuales). Para no mezclar vistas,

          // re-consultamos /api/data?type=actual para aplicar el filtro correcto.

          await fetchData();

        } catch (e) {

          // Si falla, al menos intenta usar el payload directo

          try {

            const data = JSON.parse(msg.data);

            DATA = data;

            setUpdatedAt();

            showToast('Datos actualizados');

            route();

          } catch (_) { }

        }

      });

      ev.onerror = () => {

        // fallback to polling

        setTimeout(fetchData, 3000);

      };

    }

  } catch (_) { }



  // Cuenta las navegaciones dentro de la página: “Volver” solo usa el historial si hubo alguna
  let navegacionesInternas = 0;
  window.addEventListener('hashchange', () => { navegacionesInternas += 1; route(); });

  // Primero se confirma el rol (fail-closed) y luego se renderizan las vistas
  sesionLista.finally(() => fetchData());



  // Inicializar búsqueda y filtro para virtuales

  if (isVirtuales) {

    initVMSearchAndFilter();

  }










  // ========= FÍSICOS: Interactividad UX ========= //

  // Los listeners GLOBALES (document, modal, buscador) se registran UNA sola vez.
  // Antes se volvían a registrar en cada render/evento SSE y se acumulaban cientos.
  let wirePhysicalUXGlobalesListos = false;

  const wirePhysicalUX = function () {

    const isPhys = !window.location.pathname.includes('virtuales');

    if (!isPhys) return;

    const registrarGlobales = !wirePhysicalUXGlobalesListos;
    wirePhysicalUXGlobalesListos = true;

    const tooltip = document.getElementById('slotTooltip');

    const overview = document.getElementById('overview');

    const modal = document.getElementById('rackModal');

    const modalBody = document.getElementById('rackModalBody');

    const modalClose = document.getElementById('rackModalClose');

    const search = document.getElementById('searchServers');

    const filter = document.getElementById('filterStatus');



    // Simulación de métricas por servidor (cache por id)

    function getMetricsFor(server) {

      const id = server?.id ?? server;

      if (state.metricsCache.has(id)) return state.metricsCache.get(id);

      // Random pero estable por id

      const seed = Number(String(id).replace(/\D/g, '')) || Math.floor(Math.random() * 10000);

      function rnd(min, max, s) { return Math.floor((Math.sin(s) * 10000 % 1 + 1) / 2 * (max - min + 1)) + min; }

      const cpu = rnd(10, 95, seed + 1);

      const ram = rnd(20, 90, seed + 2);

      const disk = rnd(20, 90, seed + 3);

      const temp = rnd(35, 75, seed + 4);

      const uptimeDays = rnd(1, 60, seed + 5);

      const uptimeHours = rnd(0, 23, seed + 6);

      const m = { cpu, ram, disk, temp, uptime: `${uptimeDays} días ${uptimeHours} horas` };

      state.metricsCache.set(id, m);

      return m;

    }



    // Tooltip sobre el gabinete: servidor (nombre, IP, U, criticidad, monitoreo) o U libre
    if (registrarGlobales) document.addEventListener('mousemove', (e) => {
      if (!tooltip) return;
      const unidad = e.target.closest('.gab-srv, .gab-libre');
      if (!unidad) { tooltip.classList.remove('show'); return; }
      if (unidad.classList.contains('gab-libre')) {
        tooltip.innerHTML = `<div class="gab-tip"><div class="title">U${escapeHtml(unidad.getAttribute('data-position') || '')} libre</div><div class="gab-tip__fila">Suelta aquí un servidor para moverlo</div></div>`;
      } else {
        const id = decodeURIComponent(unidad.getAttribute('data-server-id') || '');
        const crit = unidad.getAttribute('data-estado') || 'no_critico';
        const mon = ESTADOS_MONITOREO[claveMonitoreo(estadosMonitoreo.get(id))];
        tooltip.innerHTML = `<div class="gab-tip">
          <div class="title">${escapeHtml(decodeURIComponent(unidad.getAttribute('data-server-name') || ''))}</div>
          <div class="gab-tip__fila">IP: ${escapeHtml(unidad.getAttribute('data-ip') || '—')} · ${escapeHtml(unidad.getAttribute('data-u') || '')}</div>
          <div class="gab-tip__fila"><span class="gab-crit gab-crit--${escapeHtml(crit.replace('_', '-'))}"></span>${escapeHtml(CRITICIDADES[crit]?.texto || '')}</div>
          <div class="gab-tip__fila"><span class="gab-led gab-led--${mon.clase}"></span>Monitoreo: ${escapeHtml(mon.texto)}</div>
        </div>`;
      }
      tooltip.style.left = `${e.clientX}px`;
      tooltip.style.top = `${e.clientY}px`;
      tooltip.classList.add('show');
    }, { passive: true });

    // Clic en la tarjeta de un rack (fuera de un servidor): abre la vista del rack
    document.querySelectorAll('.gab-card').forEach(rackEl => {
      // Cada rack se conecta una sola vez aunque se vuelva a renderizar
      if (rackEl.dataset.uxBound === '1') return;
      rackEl.dataset.uxBound = '1';
      rackEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-view="server"], .gab-aviso')) return; // ficha del servidor o aviso desplegable
        if (isReadOnlyUser()) {
          showReadOnlyToast();
          return;
        }
        const name = rackEl.getAttribute('data-name') || '';
        const idx = rackEl.getAttribute('data-idx');
        const idxPart = idx != null ? `&idx=${idx}` : '';
        if (name) location.hash = `view=rack&name=${name}${idxPart}`;
      });
    });

    // Teclado: Enter/Espacio sobre un servidor del gabinete abre su ficha
    if (registrarGlobales) document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const srv = e.target.closest?.('.gab-srv');
      if (!srv) return;
      e.preventDefault();
      srv.click();
    });

    // Cierre modal (compatibilidad)

    if (registrarGlobales) modalClose?.addEventListener('click', () => modal.classList.remove('show'));

    if (registrarGlobales) modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });



    // Navegación al hacer click en etiqueta (server-label)

    if (registrarGlobales) document.addEventListener('click', (e) => {

      const lbl = e.target.closest('.server-label');

      if (!lbl) return;

      if (isReadOnlyUser()) {
        e.preventDefault();
        e.stopPropagation();
        showReadOnlyToast();
        return;
      }

      const id = lbl.getAttribute('data-id');

      if (id) {

        location.hash = `view=server&id=${id}`;

        e.stopPropagation();

      }

    });




    // Overview: KPIs globales

    function renderOverview() {

      if (!overview) return;

      const racks = DATA.racks || [];

      overview.innerHTML = `
      ${construirResumenRacksHtml(racks, { servidoresSinRack: (DATA.servers || []).filter((s) => s.rackId == null || s.rackId === '') })}
    `;

    }

    function applySearchFilter() {
      const q = (search?.value || '').toLowerCase().trim();
      const f = filter?.value || 'all';
      document.querySelectorAll('.gab-srv').forEach((u) => {
        const estado = u.getAttribute('data-estado') || 'no_critico';
        let match = true;
        if (q) match = (u.getAttribute('data-buscar') || '').includes(q);
        if (f !== 'all') {
          match = match && (f === 'no_critico' ? (estado !== 'critico' && estado !== 'mantenimiento') : estado === f);
        }
        const activo = !!q || f !== 'all';
        u.classList.toggle('match', activo && match);
        u.classList.toggle('dim', activo && !match);
      });
    }

    renderOverview();
    applySearchFilter();

    if (registrarGlobales) search?.addEventListener('input', applySearchFilter);

    if (registrarGlobales) filter?.addEventListener('change', applySearchFilter);



  };

  wirePhysicalUX();

});

