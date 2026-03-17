import { inicializarGestorDiscos } from '/js/dominios/hosts/gestorDiscos.js';
import { construirResumenRacksHtml } from '/js/dominios/hosts/resumenRacks.js';
import { confirmAction } from '/js/dominios/ui-system/modalConfirm.js';

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



  // Función para formatear discos en la vista de detalles

  function formatDiscosDisplay(discosValue) {

    if (!discosValue) return '—';

    try {

      const discos = JSON.parse(discosValue);

      if (Array.isArray(discos) && discos.length > 0) {

        return discos.map(d => {

          const parts = [];

          if (d.cantidad) parts.push(`${d.cantidad}x`);

          if (d.capacidad) parts.push(d.capacidad);

          if (d.fru) parts.push(`(FRU: ${d.fru})`);

          return parts.join(' ');

        }).join('\n');

      }

    } catch (e) {

      // Si no es JSON, devolver el valor original

    }

    return discosValue;

  }

  window.formatDiscosDisplay = formatDiscosDisplay;





  let DATA = { racks: [], servers: [], meta: {} };

  let lastUpdatedAt = null; // Para detectar cambios y mostrar toast

  // Estado UI para físicos

  const state = {

    metricsCache: new Map(), // serverId -> {cpu, ram, disk, temp, uptime}

    filter: 'all',

    search: ''

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

      { key: 'vsphere', label: 'VMware vSphere', description: 'Hosts dedicados a VMware vSphere' }

    ]

  };

  // Mostrar/ocultar etiquetas laterales con IP/Hostname en racks físicos (persistido)

  let SHOW_SERVER_LABELS = localStorage.getItem('showServerLabels') === '1';

  const toggleBtn = document.getElementById('btnToggleLabels');

  if (toggleBtn && !isVirtuales) {

    const setBtnText = () => toggleBtn.textContent = SHOW_SERVER_LABELS ? '🙈 Ocultar etiquetas' : '👁️ Mostrar etiquetas';

    setBtnText();

    toggleBtn.addEventListener('click', async () => {

      SHOW_SERVER_LABELS = !SHOW_SERVER_LABELS;

      localStorage.setItem('showServerLabels', SHOW_SERVER_LABELS ? '1' : '0');

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

        console.error('Error exportando:', err);

        showToast('âŒ Error al exportar Excel');

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



  function openServerModal(initialRackName) {

    if (!serverModal || !serverForm) return;

    const titleEl = document.getElementById('serverModalTitle');

    if (titleEl) {

      titleEl.textContent = initialRackName

        ? `Agregar VM a ${initialRackName}`

        : 'Agregar Servidor Virtual';

    }

    serverForm.reset();

    const serverIdEl = document.getElementById('serverId');

    if (serverIdEl) serverIdEl.value = '';

    // Limpiar contenedor de discos dinámicos

    const discosContainer = document.getElementById('discosContainer');

    if (discosContainer) discosContainer.innerHTML = '';



    const rackSelect = document.getElementById('serverRack');

    const rackSelectContainer = rackSelect?.closest('div[style*="gap"]');



    if (rackSelect) {

      rackSelect.innerHTML = '';

      const racks = DATA.racks || [];

      racks.forEach(r => {

        const opt = document.createElement('option');

        opt.value = r.name;

        opt.textContent = r.name;

        rackSelect.appendChild(opt);

      });



      if (initialRackName) {

        // Host específico: preseleccionar y ocultar selector

        rackSelect.value = initialRackName;

        rackSelect.disabled = true;

        if (rackSelectContainer) rackSelectContainer.style.display = 'none';

      } else {

        // Sin host específico: mostrar selector

        rackSelect.disabled = false;

        if (rackSelectContainer) rackSelectContainer.style.display = 'grid';

      }

    }

    serverModal.style.display = 'flex';

  }



  function closeServerModal() {

    if (serverModal) serverModal.style.display = 'none';

  }



  function openRackModal() {

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



  // Función para editar servidor

  function openServerModalForEdit(server) {

    // Obtener elementos directamente para evitar problemas de timing

    const modal = document.getElementById('serverModal');

    const form = document.getElementById('serverForm');

    console.log('openServerModalForEdit called', server);

    if (!modal || !form) {

      console.error('Modal or form not found', { modal, form });

      showToast('Error: No se encontró el formulario de edición', 'error');

      return;

    }

    const titleEl = document.getElementById('serverModalTitle');

    if (titleEl) titleEl.textContent = isVirtuales ? 'Editar Servidor Virtual' : 'Editar Servidor Físico';



    // Populate rack select first

    const rackSelect = document.getElementById('serverRack');

    if (rackSelect) {

      rackSelect.innerHTML = '';

      const racks = DATA.racks || [];

      racks.forEach(r => {

        const opt = document.createElement('option');

        opt.value = r.name;

        opt.textContent = r.name;

        rackSelect.appendChild(opt);

      });

    }



    // Helper para establecer valor si el elemento existe

    const setVal = (id, value) => {

      const el = document.getElementById(id);

      if (el) el.value = value ?? '';

    };



    // Fill form with server data - campos comunes

    setVal('serverId', server.id);

    setVal('serverNombre', server.nombre);

    setVal('serverRack', server.rack || server.rack_norm || server.rackNorm);

    setVal('serverUnits', server.rack_units || server.rackUnits || 2);

    setVal('serverPosition', server.rack_position || server.rackPosition);

    setVal('serverIP', server.ip);

    setVal('serverHostname', server.hostname);

    setVal('serverRAM', server.ram_gb || server.ramGb);

    setVal('serverSO', server.so);

    setVal('serverUsuario', server.usuario);

    setVal('serverSoftware', server.software);

    populateDiscos(server.discos);

    setVal('serverDatastore', server.datastore);

    setVal('serverConexion', server.conexion);

    setVal('serverBackup', server.backup);

    setVal('serverFechaInstalacion', formatDateForInput(server.fecha_instalacion || server.fechaInstalacion));

    setVal('serverFechaMantenimiento', formatDateForInput(server.fecha_mantenimiento || server.fechaMantenimiento));

    setVal('serverFechaBackup', formatDateForInput(server.fecha_backup || server.fechaBackup));



    // Campos específicos de físicos

    setVal('serverLabel', server.server_label || server.serverLabel);

    setVal('serverMarca', server.marca);

    setVal('serverModelo', server.modelo);

    setVal('serverTipo', server.tipo);

    setVal('serverSerie', server.serie);

    setVal('serverSocket', server.socket);

    setVal('serverNoPorSocket', server.no_por_socket || server.noPorSocket);

    setVal('serverProcLogicos', server.procesadores_logicos || server.procesadoresLogicos);



    // Normalizar estado para el select (CRITICO, NORMAL, ACTIVO)

    const estadoVal = (server.estado || 'ACTIVO').toString().toUpperCase()

      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    let normalizedEstado = 'ACTIVO';

    if (estadoVal.includes('CRITICO') || estadoVal.includes('CRIT')) normalizedEstado = 'CRITICO';

    else if (estadoVal.includes('NORMAL')) normalizedEstado = 'NORMAL';

    else if (estadoVal.includes('ACTIVO')) normalizedEstado = 'ACTIVO';

    setVal('serverEstado', normalizedEstado);



    // Campo activo/operativo (diferente entre páginas)

    setVal('serverActivo', server.activo || 'SI');

    setVal('serverOperativo', server.activo || 'SI');



    // Campos específicos de virtuales - Seguridad y Monitoreo

    setVal('serverMtm', server.mtm);

    setVal('serverConfigBackup', server.config_backup || server.configBackup);

    setVal('serverSophosEp', server.sophos_ep || server.sophosEp);

    setVal('serverVicarius', server.vicarius);

    setVal('serverAcronis', server.acronis);

    setVal('serverVeeam', server.veeam);

    setVal('serverManual', server.manual);

    setVal('serverZabbix', server.zabbix);

    setVal('serverWazuh', server.wazuh);

    setVal('serverBluelevel', server.bluelevel);

    setVal('serverPam', server.pam);

    setVal('serverUsuarioPam', server.usuario_pam || server.usuarioPam);



    // Campos de Storage (físicos)

    setVal('serverStorage', server.storage);

    setVal('serverOcsInventario', server.ocs_inventario || server.ocsInventario);

    setVal('serverDatastoreVirtuales', server.datastore_virtuales || server.datastoreVirtuales);

    setVal('serverConexionStorage', server.conexion_storage || server.conexionStorage);



    modal.style.display = 'flex';

  }



  // Helper para formatear fechas para input type="date"

  function formatDateForInput(dateVal) {

    if (!dateVal) return '';

    const d = new Date(dateVal);

    if (isNaN(d.getTime())) return '';

    return d.toISOString().split('T')[0];

  }



  // Exponer funciones globalmente para que renderServer pueda accederlas

  window.serverManager = {

    openServerModal,

    openServerModalForEdit,

    closeServerModal,

    deleteServer: async (serverId, serverName) => {

      const accepted = await confirmAction({
        title: 'Eliminar servidor',
        message: `¿Eliminar el servidor "${serverName}"? Esta accion no se puede deshacer.`,
        confirmText: 'Eliminar servidor',
        tone: 'danger'
      });
      if (!accepted) return;

      try {

        const res = await fetch(`/api/servers/${serverId}`, { method: 'DELETE' });

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

    }

  };



  // Event listeners para modales - disponibles en ambas páginas

  document.getElementById('serverModalClose')?.addEventListener('click', closeServerModal);

  document.getElementById('serverFormCancel')?.addEventListener('click', closeServerModal);



  // Note: Modal no longer closes on outside click - only via X button or Cancel



  // Submit del formulario de servidor - disponible en ambas páginas

  serverForm?.addEventListener('submit', async (e) => {

    e.preventDefault();

    try {

      const serverId = document.getElementById('serverId')?.value?.trim();

      const isEdit = !!serverId;

      const nombre = document.getElementById('serverNombre')?.value?.trim();

      const rackNorm = document.getElementById('serverRack')?.value?.trim();

      const rackUnits = Number(document.getElementById('serverUnits')?.value || 2);

      const rackPositionVal = document.getElementById('serverPosition')?.value;

      const ip = document.getElementById('serverIP')?.value?.trim();

      const hostname = document.getElementById('serverHostname')?.value?.trim();

      const ram = document.getElementById('serverRAM')?.value?.trim();

      const so = document.getElementById('serverSO')?.value?.trim();

      const estado = document.getElementById('serverEstado')?.value || 'ACTIVO';

      const usuario = document.getElementById('serverUsuario')?.value?.trim();

      const software = document.getElementById('serverSoftware')?.value?.trim();

      const discos = getDiscosJSON();

      console.log('DEBUG discos value:', discos);

      const datastore = document.getElementById('serverDatastore')?.value?.trim();

      const conexion = document.getElementById('serverConexion')?.value?.trim();

      const backup = document.getElementById('serverBackup')?.value?.trim();

      const fechaInstalacion = document.getElementById('serverFechaInstalacion')?.value || null;

      const fechaMantenimiento = document.getElementById('serverFechaMantenimiento')?.value || null;

      const fechaBackup = document.getElementById('serverFechaBackup')?.value || null;

      // Campo activo puede ser serverActivo (físicos) o serverOperativo (virtuales)

      const activo = document.getElementById('serverActivo')?.value || document.getElementById('serverOperativo')?.value || 'SI';



      // Campos adicionales solo para físicos

      const serverLabel = document.getElementById('serverLabel')?.value?.trim();

      const marca = document.getElementById('serverMarca')?.value?.trim();

      const modelo = document.getElementById('serverModelo')?.value?.trim();

      const tipo = document.getElementById('serverTipo')?.value?.trim();

      const serie = document.getElementById('serverSerie')?.value?.trim();

      const socket = document.getElementById('serverSocket')?.value?.trim();

      const noPorSocket = document.getElementById('serverNoPorSocket')?.value?.trim();

      const procLogicos = document.getElementById('serverProcLogicos')?.value?.trim();



      if (!nombre || !rackNorm) {

        showToast('Nombre y rack/host son obligatorios', 'warning'); return;

        return;

      }



      // Detectar tipo según la página

      const serverType = isVirtuales ? 'virtuales' : 'fisicos';



      const body = {

        type: serverType,

        nombre,

        rack_norm: rackNorm,

        rack_raw: rackNorm,

        rack_units: rackUnits,

        rack_position: rackPositionVal ? Number(rackPositionVal) : null,

        ip,

        hostname,

        usuario,

        ram_gb: ram,

        so,

        estado,

        software,

        discos,

        datastore,

        conexion,

        backup,

        fecha_instalacion: fechaInstalacion,

        fecha_mantenimiento: fechaMantenimiento,

        fecha_backup: fechaBackup,

        activo,

        // Campos adicionales de físicos (el backend ignorará si no aplican)

        server_label: serverLabel,

        marca,

        modelo,

        tipo: tipo,

        serie,

        socket,

        no_por_socket: noPorSocket,

        procesadores_logicos: procLogicos

      };



      const url = isEdit ? `/api/servers/${serverId}` : '/api/servers';

      const method = isEdit ? 'PUT' : 'POST';



      const res = await fetch(url, {

        method,

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify(body)

      });

      const result = await res.json();

      if (!res.ok) {

        showToast(result.error || (isEdit ? 'Error actualizando servidor' : 'Error creando servidor'), 'error');

        return;

      }

      closeServerModal();

      await fetchData();

      showToast(isEdit ? 'Servidor actualizado correctamente' : 'Servidor creado correctamente');

      if (isEdit) {

        // Re-render the server detail view after update

        location.hash = `view=server&id=${serverId}`;

      }

    } catch (err) {

      console.error('Error guardando servidor:', err);

      showToast('Error de red guardando servidor', 'error');

    }

  });



  // Event listeners específicos de virtuales (rack modals, botones agregar)

  if (isVirtuales) {

    btnAddServer?.addEventListener('click', () => openServerModal());

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

        console.error('Error exportando:', err);

        showToast('âŒ Error al exportar Excel');

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



    rackForm?.addEventListener('submit', async (e) => {

      e.preventDefault();

      try {

        const rackId = document.getElementById('rackId')?.value?.trim();

        const rackName = document.getElementById('rackName')?.value?.trim();

        const isEdit = !!rackId;



        if (!rackName) {

          showToast('Nombre del host obligatorio', 'warning'); return;

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



  // Toast simple para notificar actualizaciones

  let toastEl = null;

  function ensureToast() {

    if (!toastEl) {

      toastEl = document.createElement('div');

      toastEl.className = 'update-toast';

      toastEl.setAttribute('aria-live', 'polite');

      document.body.appendChild(toastEl);

    }

  }

  function showToast(message, duration = 3000) {

    ensureToast();

    toastEl.textContent = message;

    toastEl.classList.add('show');

    clearTimeout(showToast._t);

    showToast._t = setTimeout(() => toastEl.classList.remove('show'), duration);

  }



  function escapeHtml(value) {
    const str = (value ?? '').toString();
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmt(val) {
    const limpio = (val ?? '').toString().trim();
    return limpio ? escapeHtml(limpio) : '—';
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

    const e = (estado || '').toString().toLowerCase().trim()

      .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remover acentos

    if (e.includes('critico') || e.includes('crit')) return 'critico';

    if (e.includes('activo') || e === 'si' || e === 'yes') return 'activo';

    if (e.includes('normal') || e.includes('ok')) return 'normal';

    if (e.includes('inactivo') || e === 'no') return 'inactivo';

    if (e.includes('mant')) return 'mantenimiento';

    return 'activo'; // Por defecto

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



    if (!racks || racks.length === 0) {

      console.log('No racks to display - showing fallback message');
      const racksDebug = fmt(JSON.stringify(racks));

      app.innerHTML = `

      <div class="loading">

        <h2>No se encontraron racks para mostrar</h2>

        <p>Datos cargados: ${DATA.servers ? DATA.servers.length : 0} servidores</p>

        <p>Racks array: ${racksDebug}</p>

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

      // FÍSICOS: rack view con hooks para interactividad

      // Panel overview arriba (se rellena luego)

      try { document.getElementById('overview').style.display = 'flex'; } catch (_) { }

      // Asegura que el contenedor #content esté visible para evitar huecos

      try { document.getElementById('content').style.display = 'block'; } catch (_) { }

      app.innerHTML = `

      ${renderErrorBlock(DATA.meta?.error)}

      <div class="rack-grid">

        ${racks.map((r, i) => `

          <div class="rack" data-view="rack" data-idx="${i}" data-name="${encodeURIComponent(r.name)}" data-rack-name="${encodeURIComponent(r.name)}" title="Ver detalle de ${fmt(r.name)}">

            <div class="rack-chassis">

              <div class="rack-title-badge">${fmt(r.name)}</div>

              <div class="rack-units">

                ${generateRackUnits(r.servers.length, r.name, r.servers, SHOW_SERVER_LABELS)}

              </div>

              <div class="rack-base"></div>

            </div>

            <div class="rack-content">

              <div class="rack-content__header">

                <span class="rack-content__icon" aria-hidden="true">🗄️️</span>

                <div class="rack-content__info">

                  <h2>${fmt(r.name)}</h2>

                  <div class="muted">${r.servers.length} servidores instalados</div>

                </div>

                <span class="rack-content__count" title="Unidades ocupadas">${Math.min(r.servers.length * 2, 42)}U</span>

              </div>

            </div>

          </div>

        `).join('')}

      </div>

    `;

      // Ajustar el ancho de cada rack para que quepan todos sin scroll horizontal

      try {

        const grid = document.querySelector('.rack-grid');

        const count = grid ? grid.querySelectorAll('.rack').length : 0;

        if (grid && count > 0) {

          grid.style.setProperty('--rack-count', String(count));

          // Gap base adaptable según el ancho disponible

          const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);

          const gap = vw < 1400 ? 16 : 20;

          grid.style.setProperty('--rack-gap', gap + 'px');

          if (SHOW_SERVER_LABELS) {

            // Calcular ancho de etiquetas lateral según ancho de rack

            const rackWidth = (grid.clientWidth - (count - 1) * gap) / count;

            const labelsW = Math.max(210, Math.min(320, Math.floor(rackWidth * 0.52)));

            grid.style.setProperty('--labels-w', labelsW + 'px');

          } else {

            grid.style.setProperty('--labels-w', '0px');

          }

        }

        // Alinear etiquetas solo si están activadas

        const alignServerLabels = () => {

          if (!SHOW_SERVER_LABELS) return;

          document.querySelectorAll('.rack').forEach(rackEl => {

            const unitsInner = rackEl.querySelector('.rack-units-inner');

            const labelsEl = rackEl.querySelector('.rack-labels');

            if (!unitsInner || !labelsEl) return;



            const rackUnits = Array.from(unitsInner.querySelectorAll('.rack-unit'));

            const labels = Array.from(labelsEl.querySelectorAll('.server-label'));



            if (rackUnits.length === 0) return;



            // Fase 1: Calcular posiciones ideales (centro del servidor)
            const labelData = [];
            const labelsRect = labelsEl.getBoundingClientRect();
            const innerRect = unitsInner.getBoundingClientRect();

            labels.forEach(lbl => {
              const unitIndex = parseInt(lbl.getAttribute('data-unit-index') || '0', 10);
              if (isNaN(unitIndex) || unitIndex >= rackUnits.length) return;

              const firstUnit = rackUnits[unitIndex];
              const secondUnit = (unitIndex + 1 < rackUnits.length) ? rackUnits[unitIndex + 1] : firstUnit;
              if (!firstUnit) return;

              const firstRect = firstUnit.getBoundingClientRect();
              const secondRect = secondUnit.getBoundingClientRect();

              // Centro del servidor relativo al contenedor de etiquetas
              const serverCenter = ((firstRect.top + secondRect.bottom) / 2) - labelsRect.top;

              // Medir alto real de la etiqueta
              lbl.style.top = '0px';
              lbl.style.visibility = 'hidden';
              const lblH = lbl.offsetHeight || 20;
              lbl.style.visibility = '';

              labelData.push({ el: lbl, idealTop: serverCenter, height: lblH });
            });

            // Fase 2: Posicionar etiquetas, resolver solapamientos solo cuando los haya
            if (labelData.length > 0) {
              const minGap = 1;

              // Ordenar por posición ideal
              labelData.sort((a, b) => a.idealTop - b.idealTop);

              // Iniciar con posiciones ideales (top edge)
              const tops = labelData.map(d => d.idealTop - d.height / 2);

              // Solo resolver solapamientos entre etiquetas adyacentes
              for (let i = 1; i < tops.length; i++) {
                const prevBottom = tops[i - 1] + labelData[i - 1].height + minGap;
                if (tops[i] < prevBottom) {
                  tops[i] = prevBottom;
                }
              }

              // Si hay muchas etiquetas y poco espacio, reducir tamaño
              const containerH = labelsRect.height || labelsEl.clientHeight || 1;
              const avgSpace = containerH / labelData.length;
              let scaleCls = '';
              if (avgSpace < 28) scaleCls = 'labels-dense';
              else if (avgSpace < 38) scaleCls = 'labels-compact';
              if (scaleCls) labelsEl.classList.add(scaleCls);

              // Aplicar posiciones (center para CSS translateY(-50%))
              labelData.forEach((d, i) => {
                d.el.style.top = `${Math.round(tops[i] + d.height / 2)}px`;
              });
            }

          });

        };

        requestAnimationFrame(() => alignServerLabels());

        // También llamar después de un breve delay para asegurar que el layout esté completo

        setTimeout(() => alignServerLabels(), 100);

        // Recalcular en resize

        const onResize = () => {

          const vw2 = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);

          const gap2 = vw2 < 1400 ? 16 : 20;

          const grid2 = document.querySelector('.rack-grid');

          grid2?.style.setProperty('--rack-gap', gap2 + 'px');

          if (grid2) {

            const cnt2 = grid2.querySelectorAll('.rack').length;

            const rackWidth2 = (grid2.clientWidth - (cnt2 - 1) * gap2) / cnt2;

            if (SHOW_SERVER_LABELS) {

              const labelsW2 = Math.max(210, Math.min(320, Math.floor(rackWidth2 * 0.52)));

              grid2.style.setProperty('--labels-w', labelsW2 + 'px');

            } else {

              grid2.style.setProperty('--labels-w', '0px');

            }

          }

          // Reajustar posiciones de etiquetas tras el reflow

          requestAnimationFrame(() => {

            try { alignServerLabels(); } catch (_) { }

          });

        };

        window.addEventListener('resize', onResize, { passive: true });

      } catch (_) { }

      wirePhysicalUX();

      // Asignar clases few-servers / many-servers según cantidad

      try {

        document.querySelectorAll('.rack').forEach(rackEl => {

          const units = rackEl.querySelector('.rack-units');

          const count = units?.querySelectorAll('.rack-unit').length || 0;

          units?.classList.remove('few-servers', 'many-servers');

          if (count <= 10) units?.classList.add('few-servers');

          else if (count >= 28) units?.classList.add('many-servers');

        });

      } catch (_) { }

    }



    console.log('renderHome completed, innerHTML set');

  }



  function changeVirtualMode(mode) {

    if (!isVirtuales) return;

    const allowed = new Set(['menu', 'clusters', 'vsphere']);

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

    } else if (virtualState.mode === 'vsphere') {

      content = renderVirtualVsphere();

    } else if (virtualState.mode === 'clusterDetail') {

      content = renderVirtualClusterDetail();

    } else {

      content = renderVirtualMenu();

    }

    app.innerHTML = `${errorBlock}${content}`;



    // Actualizar visibilidad de botones del header

    updateHeaderButtons();



    try {

      app.classList.remove('fade-in');

      void app.offsetWidth;

      app.classList.add('fade-in');

    } catch (_) { }



    // Aplicar estilos visuales post-render para VMs filtradas

    applyVMVisualStyles();



    // Wire up events for cluster detail view if active

    if (virtualState.mode === 'clusterDetail') {

      wireClusterDetailEvents();

    }



    // Wiring para botón de crear cluster en el menú

    if (isVirtuales && virtualState.mode === 'menu') {

      // Botón para crear nueva vista (aparece en el menú principal)

      const btnCreateView = document.getElementById('btnCreateView');

      btnCreateView?.addEventListener('click', async () => {

        const viewName = prompt('Nombre de la nueva vista (ej: Power Systems, AIX Hosts):');

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

                const newName = prompt('Nuevo nombre de la vista:', currentName);

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

          if (!rackId) return showToast('Por favor seleccione un host', 'warning'); return;



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

          const newName = prompt('Nuevo nombre para el clúster:', cluster.name);

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

          if (e.target.tagName === 'BUTTON' && e.target.closest('.link-button')) {

            const rackId = decodeURIComponent(e.target.getAttribute('data-remove-rack-id') || '');

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

    <div class="virtual-option-wrapper" style="position:relative">

      <button class="virtual-option" data-cluster-key="${encodeURIComponent(v.key || '')}" data-virtual-mode="clusterDetail">

        <span class="virtual-option__label">${v.name}</span>

        <span class="virtual-option__desc">${v.description || 'Vista personalizada de hosts'}</span>

      </button>

      <div class="view-actions" style="position:absolute;top:8px;right:8px;display:flex;gap:4px;z-index:10">

        <button class="view-edit-btn" data-view-id="${encodeURIComponent(v.id)}" data-view-name="${encodeURIComponent(v.name)}" title="Editar" style="background:#3b82f6;color:white;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px">✏️</button>

        <button class="view-delete-btn" data-view-id="${encodeURIComponent(v.id)}" data-view-name="${encodeURIComponent(v.name)}" title="Eliminar" style="background:#ef4444;color:white;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px">🗑️</button>

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

      <div class="virtual-menu__actions" style="margin-top:24px;text-align:center">

        <button id="btnCreateView" class="home-btn" style="background:#10b981;color:white;padding:12px 24px">

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

      <section class="cluster-section" data-cluster="${encodeURIComponent(group.key || '')}" data-idx="${idx}">

        <header class="cluster-section__header" data-cluster-key="${encodeURIComponent(group.key || '')}">

          <div style="flex:1">

            <h2>${group.name}</h2>

            <p class="muted">${hosts.map(h => h.name).join(', ') || 'Sin hosts asignados'}</p>

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

      <section class="cluster-section" data-cluster="${encodeURIComponent(vsphereCluster.key || '')}">

        <header class="cluster-section__header" data-cluster-key="${encodeURIComponent(vsphereCluster.key || '')}">

          <div>

            <h3>Hosts asignados</h3>

            <p class="muted">${hostList.map(h => h.name).join(', ') || 'Sin hosts asignados'}</p>

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

    <section class="cluster-detail" data-source="${cluster.source}" data-cluster="${encodeURIComponent(cluster.key || '')}">

      <header class="cluster-detail__header">

        <div>

          <p class="muted">Hosts: ${hosts.map(h => h.name).join(', ') || 'Sin hosts asignados'}</p>

          <span class="cluster-detail__stats">${hosts.length} hosts · ${totalVMs} VMs</span>

        </div>

        <div class="cluster-admin-actions">

          <button class="home-btn" id="btnEditCluster">Editar clúster</button>

          <button class="home-btn" id="btnDeleteCluster" style="background:#ef4444;color:white">Eliminar clúster</button>

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

            <button id="btnAddHostToCluster" class="home-btn">Agregar al clúster</button>

          </div>

          <div class="cluster-host-admin__list">

            <h4>Hosts asignados</h4>

            <ul>

              ${hosts.map(h => `<li data-rack-id="${encodeURIComponent(h.id || '')}">${fmt(h.name)} <button class="link-button" data-remove-rack-id="${encodeURIComponent(h.id || '')}">Quitar</button></li>`).join('') || '<li class="muted">No hay hosts asignados</li>'}

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



  function renderVirtualHostCard(host, options = {}) {

    const { preview = false } = options;

    let serverList = [...(host?.servers || [])];

    const vmCount = serverList.length;



    // Visualización de VMs

    const vmFilter = virtualState.vmFilter || 'all';

    const vmSearch = (virtualState.vmSearch || '').toLowerCase().trim();



    const vmMatchesFilter = (vm) => {

      const estado = normalizeEstado(vm.estado || '');

      if (vmFilter !== 'all' && estado !== vmFilter) return false;

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

              </div>

            </div>

            <button class="btn-edit-host" data-host-id="${host.id}" data-host-name="${encodeURIComponent(host.name)}" title="Editar nombre del host" style="padding:4px 8px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;margin-right:8px">✏️ Editar</button>

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



  function generateRackUnits(serverCount, rackName, servers, withLabels = false) {

    const units = [];

    const totalUnits = 42;

    const serverHeight = 2; // Cada servidor ocupa 2U



    // Crear array para marcar qué unidades están ocupadas por servidores

    const occupiedUnits = new Array(totalUnits).fill(false);

    const serverColors = new Array(totalUnits).fill('off');

    const serverInfo = new Array(totalUnits).fill(null);

    const serverIds = new Array(totalUnits).fill(null);

    const serverIPs = new Array(totalUnits).fill('');

    const serverHNs = new Array(totalUnits).fill('');



    if (servers && servers.length > 0) {

      // Verificar si los servidores tienen rack_position definido

      const hasPositions = servers.some(s => s.rackPosition != null && s.rackPosition > 0);



      if (hasPositions) {

        // MODO POSICIONADO: Usar las posiciones exactas de la base de datos

        servers.forEach((serverData, i) => {

          const position = serverData.rackPosition || null;

          const units = serverData.rackUnits || 2;



          // Convertir posición de rack a índice de array (42 -> índice 0, 41 -> índice 1, etc.)

          let startIndex;

          if (position && position > 0 && position <= totalUnits) {

            startIndex = totalUnits - position; // Posición 42 = índice 0, posición 1 = índice 41

          } else {

            // Si no tiene posición, buscar primer espacio disponible

            startIndex = -1;

            for (let j = 0; j < totalUnits - units + 1; j++) {

              let canFit = true;

              for (let k = 0; k < units; k++) {

                if (occupiedUnits[j + k]) {

                  canFit = false;

                  break;

                }

              }

              if (canFit) {

                startIndex = j;

                break;

              }

            }

          }



          if (startIndex >= 0 && startIndex < totalUnits) {

            // Determinar el color del servidor basado en el estado real

            let serverColor;

            const estadoNorm = normalizeEstado(serverData.estado || serverData.activo || '');

            if (estadoNorm === 'critico') {

              serverColor = 'red';  // Crítico (servidor importante)

            } else if (estadoNorm === 'inactivo') {

              serverColor = 'gray';  // Inactivo

            } else if (estadoNorm === 'mantenimiento') {

              serverColor = 'orange';  // En mantenimiento

            } else {

              serverColor = 'green';  // Activo/Normal

            }



            const tooltipInfo = `IP: ${fmt(serverData.ip)}&#10;Hostname: ${fmt(serverData.hostname || serverData.nombre)}`;

            const sid = serverData.id;

            const ipVal = serverData.ip || '';

            const hnVal = serverData.hostname || serverData.nombre || '';



            // Marcar las unidades ocupadas por este servidor

            for (let u = 0; u < units; u++) {

              const idx = startIndex + u;

              if (idx < totalUnits) {

                occupiedUnits[idx] = true;

                serverColors[idx] = serverColor;

                serverInfo[idx] = tooltipInfo;

                serverIds[idx] = sid;

                serverIPs[idx] = ipVal;

                serverHNs[idx] = hnVal;

              }

            }

          }

        });

      } else {

        // MODO LEGACY: Distribuir uniformemente (sin rack_position)

        const activeServers = Math.min(servers.length, Math.floor(totalUnits / serverHeight));

        const totalServerUnits = activeServers * serverHeight;

        const availableSpace = totalUnits - totalServerUnits;

        const gaps = activeServers + 1;

        const baseGapSize = Math.floor(availableSpace / gaps);

        const extraSpaces = availableSpace % gaps;



        let currentPos = baseGapSize;



        for (let i = 0; i < activeServers; i++) {

          if (i < extraSpaces) {

            currentPos += 1;

          }



          const serverData = servers[i] || { id: `missing-${i + 1}`, ip: '', hostname: '', nombre: '' };



          // Determinar el color del servidor basado en el estado real

          let serverColor;

          const estadoNorm = normalizeEstado(serverData.estado || serverData.activo || '');

          if (estadoNorm === 'critico') {

            serverColor = 'red';  // Crítico (servidor importante)

          } else if (estadoNorm === 'inactivo') {

            serverColor = 'gray';  // Inactivo

          } else if (estadoNorm === 'mantenimiento') {

            serverColor = 'orange';  // En mantenimiento

          } else {

            serverColor = 'green';  // Activo/Normal

          }



          const tooltipInfo = serverData ? `IP: ${fmt(serverData.ip)}&#10;Hostname: ${fmt(serverData.hostname || serverData.nombre)}` : '';



          if (currentPos < totalUnits - 1) {

            occupiedUnits[currentPos] = true;

            occupiedUnits[currentPos + 1] = true;

            serverColors[currentPos] = serverColor;

            serverColors[currentPos + 1] = serverColor;

            serverInfo[currentPos] = tooltipInfo;

            serverInfo[currentPos + 1] = tooltipInfo;

            const sid = serverData ? serverData.id : null;

            serverIds[currentPos] = sid;

            serverIds[currentPos + 1] = sid;



            if (serverData) {

              const ipVal = serverData.ip || '';

              const hnVal = serverData.hostname || serverData.nombre || '';

              serverIPs[currentPos] = ipVal; serverIPs[currentPos + 1] = ipVal;

              serverHNs[currentPos] = hnVal; serverHNs[currentPos + 1] = hnVal;

            }

            currentPos += serverHeight + baseGapSize;

          }

        }

      }

    }



    // Asignar índice de servidor para alternar colores
    const serverIndex = new Array(totalUnits).fill(-1);
    let srvIdx = 0;
    for (let i = 0; i < totalUnits; i++) {
      if (occupiedUnits[i] && (i === 0 || serverIds[i] !== serverIds[i - 1])) {
        serverIndex[i] = srvIdx;
        srvIdx++;
      } else if (occupiedUnits[i]) {
        serverIndex[i] = serverIndex[i - 1];
      }
    }

    for (let i = 0; i < totalUnits; i++) {

      const isServer = occupiedUnits[i];

      const isFirstUnitOfServer = isServer && (i === 0 || serverIds[i] !== serverIds[i - 1]);

      const statusColor = serverColors[i];

      const tooltip = serverInfo[i] ? `title="${serverInfo[i]}&#10;Arrastrar para mover a otro rack"` : '';

      const sid = serverIds[i];

      const dataAttrs = sid ? `data-view="server" data-id="${encodeURIComponent(sid)}" data-server-id="${encodeURIComponent(sid)}"` : '';

      const draggableAttr = isFirstUnitOfServer && sid ? 'draggable="true"' : '';

      const ip = serverIPs[i] || '';

      const hn = serverHNs[i] || '';

      const serverNameAttr = hn ? `data-server-name="${encodeURIComponent(hn)}"` : '';



      // Obtener estado normalizado para el filtro desde los datos del servidor

      const serverDataForUnit = servers?.find(s => s.id === sid);

      const estadoAttr = serverDataForUnit ? normalizeEstado(serverDataForUnit.estado || serverDataForUnit.activo || '') : 'activo';
      const srvParity = (isServer && serverIndex[i] >= 0) ? (serverIndex[i] % 2 === 0 ? 'server-even' : 'server-odd') : '';



      units.push(`

      <div class="rack-unit ${isServer ? 'active' : 'inactive'} ${isFirstUnitOfServer ? 'server-top' : ''} ${srvParity}" ${tooltip} ${dataAttrs} ${draggableAttr} ${serverNameAttr} data-estado="${estadoAttr}">

        <div class="unit-panel">

          <div class="unit-led ${statusColor}"></div>

          <div class="unit-label">${String(totalUnits - i).padStart(2, '0')}</div>

          <div class="unit-led ${statusColor}"></div>

        </div>

      </div>

    `);

    }



    if (!withLabels) {

      return `<div class="rack-units-inner">${units.join('')}</div>`;

    }



    // Generar superposición de etiquetas a la derecha (una por servidor)

    let labels = '';

    try {

      let uIndex = 0;

      while (uIndex < totalUnits) {

        if (occupiedUnits[uIndex] && (uIndex === 0 || serverIds[uIndex] !== serverIds[uIndex - 1])) {

          const ip = serverIPs[uIndex] || '';

          const hn = serverHNs[uIndex] || '';

          const sid = serverIds[uIndex] ? encodeURIComponent(serverIds[uIndex]) : '';

          const showIp = fmt(ip || '—');

          const showHn = fmt(hn || '—');

          // Guardar el índice de inicio del servidor (se usará en JS para calcular posición dinámica)

          labels += `<div class="server-label" data-unit-index="${uIndex}" data-view="server" data-id="${sid}"><span class="ip">${showIp}</span><span class="sep">·</span><span class="hn">${showHn}</span></div>`;

          uIndex++;

        } else {

          uIndex++;

        }

      }

    } catch (_) { }



    return `<div class="rack-units-inner">${units.join('')}</div><div class="rack-labels">${labels}</div>`;

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



    app.innerHTML = `

    <div class="scrollable">

    ${renderErrorBlock(DATA.meta?.error)}

    <div class=\"rack-detail\">

      <div class="rack-detail-header">

        <h2>${fmt(rack.name)}</h2>

        <div class="muted">${rack.servers.length} servidores</div>

        <div style="display:flex;gap:10px">

          ${isVirtuales ? `<button id="btnAddVMToHost" class="home-btn" style="background:#10b981;color:white" title="Agregar VM a este host">➕ Agregar VM</button>` : ''}

          <button id="btnDeleteRack" class="home-btn" style="background:#ef4444;color:white" title="Eliminar rack">🗑️ Eliminar Rack</button>

          <button id="btnBackRackDetail" class="back-btn">← Volver</button>

        </div>

      </div>

      <div class="rack-servers-list">

        ${rack.servers.map(s => `

          <div class="server-item" draggable="true" title="IP: ${fmt(s.ip)}&#10;Hostname: ${fmt(s.nombre || s.hostname)}&#10;Arrastrar para mover a otro rack">

            <div class="server-info" data-view="server" data-id="${encodeURIComponent(s.id)}" style="cursor:pointer;flex:1">

              <div class="server-name">${fmt(s.nombre || s.hostname)}</div>

              <div class="server-ip">${fmt(s.ip)}</div>

              <div class="server-model">${fmt(s.marca)} ${fmt(s.modelo)}</div>

            </div>

            <div class="server-status ${statusClass(s.estado)}">

              ${fmt(s.estado)}

            </div>

            <div style="display:flex;gap:5px;align-items:center">

              <button class="server-btn-edit" data-server-id="${encodeURIComponent(s.id)}" title="Editar servidor">✏️</button>

              <button class="server-btn-delete" data-server-id="${encodeURIComponent(s.id)}" data-server-name="${encodeURIComponent(s.hostname || s.nombre || '')}" title="Eliminar servidor">🗑️</button>

            </div>

          </div>

        `).join('')}

      </div>

    </div>

    </div>

  `;



    // Agregar event listeners para los botones de editar y eliminar

    document.querySelectorAll('.server-btn-edit').forEach(btn => {

      btn.addEventListener('click', (e) => {

        e.stopPropagation();

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

    return `

    <div class="card" data-view="server" data-id="${encodeURIComponent(s.id)}">

      ${header}

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

        <div>Discos</div><div style="white-space:pre-wrap">${formatDiscosDisplay(s.discos)}</div>

        <div>Datastore</div><div style="white-space:pre-wrap">${fmt(s.datastore)}</div>

        <div>Conexión</div><div style="white-space:pre-wrap">${fmt(s.conexion)}</div>

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

    <button class="home-btn" id="btnEditServer" style="background:#2563eb;margin-left:10px">✏️ Editar</button>

    <button class="home-btn" id="btnDeleteServer" style="background:#dc2626;margin-left:10px">🗑️ Eliminar</button>

  `;



    const back = `<div style="display:flex;justify-content:flex-end;margin:10px 0 0 0"><button class="back-btn" id="btnBackView">← Volver</button>${crudButtons}</div>`;

    app.innerHTML = `<div class="scrollable">${renderErrorBlock(DATA.meta?.error)}${back}${serverCard(s)}</div>`;

    document.getElementById('btnBackView')?.addEventListener('click', () => {

      if (history.length > 1) history.back(); else location.hash = '';

    });



    // Add edit/delete event listeners

    document.getElementById('btnEditServer')?.addEventListener('click', () => {

      console.log('Edit button clicked, server:', s, 'serverManager:', window.serverManager);

      if (window.serverManager) {

        window.serverManager.openServerModalForEdit(s);

      } else {

        showToast('Error: El gestor de servidores no está disponible', 'error');

      }

    });



    document.getElementById('btnDeleteServer')?.addEventListener('click', async () => {

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

      return renderRackByParams({ idx: params.get('idx'), name: params.get('name') });

    }

    if (view === 'server') return renderServer(params.get('id'));

    renderHome();

  }



  window.addEventListener('click', (e) => {

    if (isVirtuales) {

      const clusterTrigger = e.target.closest('[data-cluster-key]');

      if (clusterTrigger) {

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



  btnInicio?.addEventListener('click', async () => {

    // Volver al inicio de la vista y forzar recarga en el servidor

    location.hash = '';

    try {

      const type = getServerType();

      await fetch(`/api/reload?type=${type}`, { method: 'POST' });

    } catch (_) { }

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

    console.log(`[DEBUG] Fetching /api/data?type=${serverType}`);

    const res = await fetch(`/api/data?type=${serverType}`);

    console.log(`[DEBUG] Response status: ${res.status}`);

    DATA = await res.json();

    console.log(`[DEBUG] DATA received:`, DATA);



    if (serverType === 'virtuales') {

      try {

        const clustersRes = await fetch('/api/clusters');

        const clusters = await clustersRes.json();

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



        const hostsByCluster = {};

        for (const cluster of virtualState.clusters) {

          try {

            const chRes = await fetch(`/api/clusters/${cluster.id}/hosts`);

            const ch = await chRes.json();

            hostsByCluster[cluster.id] = Array.isArray(ch) ? ch : [];

          } catch (_) { }

        }

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

    if (!isVirtuales) {

      // Overview stats (simulado en cliente)

      try { renderOverview(); } catch (_) { }

    }

  }

  // Live updates via SSE (solo si existe #app)

  try {

    if (document.getElementById('app')) {

      const ev = new EventSource('/events');

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



  window.addEventListener('hashchange', route);

  fetchData();



  // Inicializar búsqueda y filtro para virtuales

  if (isVirtuales) {

    initVMSearchAndFilter();

  }



  btnInicio?.addEventListener('click', fetchData);







  // ========= FÍSICOS: Interactividad UX ========= //

  const wirePhysicalUX = function () {

    const isPhys = !window.location.pathname.includes('virtuales');

    if (!isPhys) return;

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



    // Tooltip sobre unidades (usamos delegación si tuvieran data)

    document.addEventListener('mousemove', (e) => {

      const unit = e.target.closest('.rack-unit');

      if (!tooltip) return;

      if (!unit) { tooltip.classList.remove('show'); return; }

      const title = unit.getAttribute('title') || '';

      // Intentar extraer info de servidor si tenemos racks en memoria

      let name = title || 'Servidor';

      let number = unit.querySelector('.unit-label')?.textContent?.trim() || '';

      const statusCls = unit.classList.contains('active') ? 'Running 🟢' : 'Stopped 🔴';

      // Solo mostrar info básica del servidor (sin métricas inventadas)

      tooltip.innerHTML = `

      <div class="title">${fmt(name)}</div>

      <div class="row"><span class="badge">#${fmt(number)}</span><span>${statusCls}</span></div>

    `;

      tooltip.style.left = `${e.clientX}px`;

      tooltip.style.top = `${e.clientY}px`;

      tooltip.classList.add('show');

    }, { passive: true });



    // Click en rack: navegar a detalle nativo (igual que virtuales)

    document.querySelectorAll('.rack').forEach(rackEl => {

      rackEl.addEventListener('click', () => {

        const name = rackEl.getAttribute('data-name') || rackEl.querySelector('.rack-content h2')?.textContent || '';

        const idx = rackEl.getAttribute('data-idx');

        const idxPart = idx != null ? `&idx=${idx}` : '';

        if (name) location.hash = `view=rack&name=${name}${idxPart}`;

      });

    });

    // Cierre modal (compatibilidad)

    modalClose?.addEventListener('click', () => modal.classList.remove('show'));

    modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });



    // Navegación al hacer click en etiqueta (server-label)

    document.addEventListener('click', (e) => {

      const lbl = e.target.closest('.server-label');

      if (!lbl) return;

      const id = lbl.getAttribute('data-id');

      if (id) {

        location.hash = `view=server&id=${id}`;

        e.stopPropagation();

      }

    });

    // Edición de host virtual sin onclick inline
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-edit-host');
      if (!btn) return;

      e.stopPropagation();
      const id = Number(btn.getAttribute('data-host-id'));
      const encodedName = btn.getAttribute('data-host-name') || '';
      if (!Number.isInteger(id) || id <= 0) return;

      window.openRackModalForEdit({ id, name: decodeURIComponent(encodedName) });
    });



    // Overview: KPIs globales

    function renderOverview() {

      if (!overview) return;

      const racks = DATA.racks || [];

      overview.innerHTML = `
      ${construirResumenRacksHtml(racks)}
    `;

    }

    function applySearchFilter() {
      const q = (search?.value || '').toLowerCase().trim();
      const f = filter?.value || 'all';

      document.querySelectorAll('.rack-unit').forEach((u) => {
        const num = u.querySelector('.unit-label')?.textContent?.trim() || '';
        const name = (u.getAttribute('title') || '').toLowerCase();
        const isServer = u.classList.contains('active');
        const estado = u.getAttribute('data-estado') || 'activo';

        let match = true;
        if (q) match = name.includes(q) || num.includes(q);
        if (isServer && f !== 'all') match = match && estado === f;

        if (f !== 'all' && isServer) {
          u.classList.toggle('dim', !match);
          u.classList.toggle('match', match);
        } else if (q) {
          u.classList.toggle('match', match);
          u.classList.toggle('dim', !match);
        } else {
          u.classList.remove('match', 'dim');
        }
      });

    }

    renderOverview();
    applySearchFilter();

    search?.addEventListener('input', applySearchFilter);

    filter?.addEventListener('change', applySearchFilter);



    // Scroll horizontal con rueda del mouse en el grid de racks

    try {

      const grid = document.querySelector('.rack-grid');

      if (grid) {

        grid.addEventListener('wheel', (ev) => {

          if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {

            grid.scrollLeft += ev.deltaY;

            ev.preventDefault();

          }

        }, { passive: false });

      }

    } catch (_) { }

  };

  wirePhysicalUX();

});

