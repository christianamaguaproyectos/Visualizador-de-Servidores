/**
 * Módulo ÚNICO y autoritativo para gestionar servidores (CRUD) en index.html y virtual.html.
 *
 * Antes app.js definía su propio window.serverManager y su propio listener "submit"
 * sobre #serverForm, y este módulo los sobrescribía: el botón "Editar" fallaba
 * (openServerModalForEdit no existía aquí) y cada guardado enviaba DOS peticiones,
 * una de ellas sin 16 campos de seguridad/storage. Ahora todo vive aquí.
 */

import { confirmAction } from '/js/dominios/ui-system/modalConfirm.js';

const $ = (id) => document.getElementById(id);

/** Asigna un valor a un campo del formulario si existe en la página */
function setVal(id, value) {
  const el = $(id);
  if (el) el.value = value ?? '';
}

/** Lee el valor (sin espacios) de un campo o null si está vacío / no existe */
function getVal(id) {
  const valor = $(id)?.value;
  if (valor === undefined || valor === null) return null;
  const limpio = String(valor).trim();
  return limpio === '' ? null : limpio;
}

/** Fecha en formato YYYY-MM-DD para inputs type="date" */
function formatDateForInput(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

/** Normaliza el estado al valor del <select>: CRITICO | NO_CRITICO | MANTENIMIENTO */
function normalizarEstado(estado) {
  const valor = (estado || 'NO_CRITICO').toString().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (valor.includes('NO_CRITICO') || valor.includes('NO CRITICO')) return 'NO_CRITICO';
  if (valor.includes('CRIT')) return 'CRITICO';
  if (valor.includes('MANT')) return 'MANTENIMIENTO';
  return 'NO_CRITICO';
}

function notificar(mensaje, tipo = 'info') {
  if (typeof window.showToast === 'function') window.showToast(mensaje, tipo);
}

class ServerManager {
  constructor() {
    this.currentType = window.location.pathname.includes('virtual') ? 'virtuales' : 'fisicos';
    this.racks = [];
    this.guardando = false;
  }

  /**
   * RBAC del cliente en modo "fail-closed": mientras no se confirme que el usuario
   * es admin/superadmin, se trata como solo lectura. (El backend igual valida.)
   */
  isReadOnlyUser() {
    const usuario = window.currentUser;
    return !(usuario && (usuario.role === 'admin' || usuario.isSuperAdmin));
  }

  notifyReadOnly() {
    notificar('Modo solo lectura.', 'warning');
  }

  /** Recarga los datos de la vista actual (función expuesta por app.js) */
  async recargarVista() {
    if (typeof window.recargarDatosServidores === 'function') {
      await window.recargarDatosServidores();
    } else {
      window.location.reload();
    }
  }

  init() {
    $('btnAddServer')?.addEventListener('click', () => this.openServerModal());
    $('btnAddRack')?.addEventListener('click', () => this.openRackModal());

    $('serverModalClose')?.addEventListener('click', () => this.closeServerModal());
    $('serverFormCancel')?.addEventListener('click', () => this.closeServerModal());

    // ÚNICO listener de envío del formulario de servidor
    $('serverForm')?.addEventListener('submit', (e) => this.handleServerSubmit(e));

    $('rackAddModalClose')?.addEventListener('click', () => this.closeRackModal());
    $('rackFormCancel')?.addEventListener('click', () => this.closeRackModal());

    const rackForm = $('rackForm');
    if (rackForm && this.currentType !== 'virtuales') {
      rackForm.addEventListener('submit', (e) => this.handleRackSubmit(e));
    }

    this.loadRacks();
  }

  async loadRacks() {
    try {
      const response = await fetch(`/api/racks?type=${this.currentType}`);
      const racks = await response.json();
      this.racks = Array.isArray(racks) ? racks : [];
    } catch (error) {
      console.error('Error cargando racks:', error);
    }
  }

  /**
   * Llena el selector de rack/host
   * @param {string} [rackPreseleccionado] - Si viene, se fija y se oculta el selector
   */
  async llenarSelectorRacks(rackPreseleccionado) {
    const rackSelect = $('serverRack');
    if (!rackSelect) return;

    await this.loadRacks();
    rackSelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Seleccionar rack/host...';
    rackSelect.appendChild(placeholder);

    this.racks.forEach((rack) => {
      const option = document.createElement('option');
      option.value = rack.name;
      option.textContent = rack.name;
      rackSelect.appendChild(option);
    });

    const contenedor = rackSelect.closest('div[style*="gap"]');
    if (rackPreseleccionado) {
      rackSelect.value = rackPreseleccionado;
      rackSelect.disabled = true;
      if (contenedor) contenedor.style.display = 'none';
    } else {
      rackSelect.disabled = false;
      if (contenedor) contenedor.style.display = 'grid';
    }
  }

  /** Muestra el modal y avisa a app.js para que reinicie la marca de "cambios sin guardar" */
  mostrarModal() {
    const modal = $('serverModal');
    if (modal) modal.style.display = 'flex';
    $('serverForm')?.dispatchEvent(new CustomEvent('serverform:abierto'));
  }

  /**
   * Abre el modal para CREAR un servidor/VM.
   * Compatibilidad: si recibe un ID numérico, abre en modo edición.
   * @param {string|number} [rackOId] - Nombre del rack/host a preseleccionar, o ID a editar
   */
  async openServerModal(rackOId) {
    if (this.isReadOnlyUser()) {
      this.notifyReadOnly();
      return;
    }

    if (rackOId !== undefined && rackOId !== null && /^\d+$/.test(String(rackOId))) {
      return this.openServerModalForEdit(rackOId);
    }
    const rackPreseleccionado = typeof rackOId === 'string' ? rackOId : undefined;

    const form = $('serverForm');
    if (!form) return;
    form.reset();
    setVal('serverId', '');
    const discos = $('discosContainer');
    if (discos) discos.replaceChildren();

    const titulo = $('serverModalTitle');
    if (titulo) {
      if (this.currentType === 'virtuales') {
        titulo.textContent = rackPreseleccionado ? `Agregar VM a ${rackPreseleccionado}` : 'Agregar Servidor Virtual';
      } else {
        titulo.textContent = 'Agregar Servidor Físico';
      }
    }

    await this.llenarSelectorRacks(rackPreseleccionado);
    this.mostrarModal();
  }

  /**
   * Abre el modal para EDITAR un servidor.
   * @param {Object|number|string} serverOId - Objeto servidor (desde la vista) o su ID
   */
  async openServerModalForEdit(serverOId) {
    if (this.isReadOnlyUser()) {
      this.notifyReadOnly();
      return;
    }

    let server = serverOId;
    if (!server || typeof server !== 'object') {
      server = await this.buscarServidor(serverOId);
      if (!server) {
        notificar('No se encontró el servidor a editar', 'error');
        return;
      }
    }

    const form = $('serverForm');
    if (!form) {
      notificar('Error: no se encontró el formulario de edición', 'error');
      return;
    }
    form.reset();

    const titulo = $('serverModalTitle');
    if (titulo) titulo.textContent = this.currentType === 'virtuales' ? 'Editar Servidor Virtual' : 'Editar Servidor Físico';

    await this.llenarSelectorRacks();

    // Campos comunes
    setVal('serverId', server.id);
    setVal('serverNombre', server.nombre);
    setVal('serverRack', server.rack || server.rack_norm || server.rackNorm);
    setVal('serverUnits', server.rack_units || server.rackUnits || 2);
    setVal('serverPosition', server.rack_position ?? server.rackPosition);
    setVal('serverIP', server.ip);
    setVal('serverHostname', server.hostname);
    setVal('serverUsuario', server.usuario);
    setVal('serverRAM', server.ram_gb || server.ramGb);
    setVal('serverSO', server.so);
    setVal('serverSoftware', server.software);
    setVal('serverDatastore', server.datastore);
    setVal('serverConexion', server.conexion);
    setVal('serverBackup', server.backup);
    setVal('serverFechaInstalacion', formatDateForInput(server.fecha_instalacion || server.fechaInstalacion));
    setVal('serverFechaMantenimiento', formatDateForInput(server.fecha_mantenimiento || server.fechaMantenimiento));
    setVal('serverFechaBackup', formatDateForInput(server.fecha_backup || server.fechaBackup));
    setVal('serverEstado', normalizarEstado(server.estado));
    setVal('serverActivo', server.activo || 'SI');
    setVal('serverOperativo', server.activo || 'SI');

    if (typeof window.populateDiscos === 'function') {
      window.populateDiscos(server.discos);
    } else {
      const contenedor = $('discosContainer');
      if (contenedor && server.discos) {
        // Texto, nunca HTML: el valor viene de la base de datos (anti-XSS)
        const aviso = document.createElement('div');
        aviso.style.cssText = 'padding:8px;color:#666';
        aviso.textContent = String(server.discos);
        contenedor.replaceChildren(aviso);
      }
    }

    // Físicos
    setVal('serverLabel', server.server_label || server.serverLabel);
    setVal('serverMarca', server.marca);
    setVal('serverModelo', server.modelo);
    setVal('serverTipo', server.tipo);
    setVal('serverSerie', server.serie);
    setVal('serverSocket', server.socket);
    setVal('serverNoPorSocket', server.no_por_socket || server.noPorSocket);
    setVal('serverProcLogicos', server.procesadores_logicos || server.procesadoresLogicos);

    // Storage (físicos)
    setVal('serverStorage', server.storage);
    setVal('serverOcsInventario', server.ocs_inventario || server.ocsInventario);
    setVal('serverDatastoreVirtuales', server.datastore_virtuales || server.datastoreVirtuales);
    setVal('serverConexionStorage', server.conexion_storage || server.conexionStorage);

    // Seguridad y monitoreo (virtuales)
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

    this.mostrarModal();
  }

  /** Busca un servidor por ID en la API */
  async buscarServidor(serverId) {
    try {
      const response = await fetch(`/api/servers?type=${this.currentType}`);
      const servers = await response.json();
      return (Array.isArray(servers) ? servers : []).find((s) => String(s.id) === String(serverId)) || null;
    } catch (error) {
      console.error('Error cargando datos del servidor:', error);
      return null;
    }
  }

  closeServerModal() {
    const modal = $('serverModal');
    if (modal) modal.style.display = 'none';
  }

  /** Construye el cuerpo COMPLETO de la petición (incluye los campos de seguridad/storage) */
  construirPayload() {
    const posicion = getVal('serverPosition');
    return {
      type: this.currentType,
      nombre: getVal('serverNombre') || '',
      server_label: getVal('serverLabel'),
      rack_norm: getVal('serverRack') || '',
      rack_raw: getVal('serverRack') || '',
      rack_units: parseInt(getVal('serverUnits'), 10) || 2,
      rack_position: posicion ? parseInt(posicion, 10) : null,
      ip: getVal('serverIP'),
      hostname: getVal('serverHostname'),
      usuario: getVal('serverUsuario'),
      marca: getVal('serverMarca'),
      modelo: getVal('serverModelo'),
      tipo: getVal('serverTipo'),
      serie: getVal('serverSerie'),
      ram_gb: getVal('serverRAM'),
      socket: getVal('serverSocket'),
      no_por_socket: getVal('serverNoPorSocket'),
      procesadores_logicos: getVal('serverProcLogicos'),
      discos: typeof window.getDiscosJSON === 'function' ? window.getDiscosJSON() : getVal('serverDiscos'),
      datastore: getVal('serverDatastore'),
      conexion: getVal('serverConexion'),
      so: getVal('serverSO'),
      software: getVal('serverSoftware'),
      estado: getVal('serverEstado') || 'NO_CRITICO',
      activo: getVal('serverActivo') || getVal('serverOperativo') || 'SI',
      fecha_instalacion: getVal('serverFechaInstalacion'),
      fecha_mantenimiento: getVal('serverFechaMantenimiento'),
      backup: getVal('serverBackup'),
      fecha_backup: getVal('serverFechaBackup'),
      // Físicos (storage)
      storage: getVal('serverStorage'),
      ocs_inventario: getVal('serverOcsInventario'),
      datastore_virtuales: getVal('serverDatastoreVirtuales'),
      conexion_storage: getVal('serverConexionStorage'),
      // Virtuales (seguridad)
      mtm: getVal('serverMtm'),
      config_backup: getVal('serverConfigBackup'),
      sophos_ep: getVal('serverSophosEp'),
      vicarius: getVal('serverVicarius'),
      acronis: getVal('serverAcronis'),
      veeam: getVal('serverVeeam'),
      manual: getVal('serverManual'),
      zabbix: getVal('serverZabbix'),
      wazuh: getVal('serverWazuh'),
      bluelevel: getVal('serverBluelevel'),
      pam: getVal('serverPam'),
      usuario_pam: getVal('serverUsuarioPam')
    };
  }

  async handleServerSubmit(e) {
    if (e) e.preventDefault();

    if (this.isReadOnlyUser()) {
      this.notifyReadOnly();
      return;
    }
    // Evita doble envío por doble clic
    if (this.guardando) return;

    const serverId = getVal('serverId');
    const esEdicion = !!serverId;
    const data = this.construirPayload();

    if (!data.nombre || !data.rack_norm) {
      notificar('Nombre y rack/host son obligatorios', 'warning');
      return;
    }

    this.guardando = true;
    try {
      const response = await fetch(esEdicion ? `/api/servers/${encodeURIComponent(serverId)}` : '/api/servers', {
        method: esEdicion ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        notificar(result.error || (esEdicion ? 'Error actualizando servidor' : 'Error creando servidor'), 'error');
        return;
      }

      this.closeServerModal();
      await this.recargarVista();
      notificar(esEdicion ? 'Servidor actualizado correctamente' : 'Servidor creado correctamente', 'success');
      if (esEdicion) {
        window.location.hash = `view=server&id=${encodeURIComponent(serverId)}`;
      }
    } catch (error) {
      console.error('Error guardando servidor:', error);
      notificar('Error de red guardando servidor', 'error');
    } finally {
      this.guardando = false;
    }
  }

  openRackModal() {
    if (this.isReadOnlyUser()) {
      this.notifyReadOnly();
      return;
    }
    // En virtuales el modal de host lo gestiona app.js
    if (this.currentType === 'virtuales') return;
    setVal('rackName', '');
    const modal = $('rackAddModal');
    if (modal) modal.style.display = 'flex';
  }

  closeRackModal() {
    const modal = $('rackAddModal');
    if (modal) modal.style.display = 'none';
  }

  async handleRackSubmit(e) {
    e.preventDefault();
    if (this.isReadOnlyUser()) {
      this.notifyReadOnly();
      return;
    }

    const nombre = getVal('rackName') || '';
    try {
      const response = await fetch('/api/racks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombre, raw_name: nombre })
      });
      const result = await response.json().catch(() => ({}));

      if (response.ok) {
        notificar('Rack/Host creado exitosamente', 'success');
        this.closeRackModal();
        await this.recargarVista();
      } else {
        notificar('Error: ' + (result.error || 'No se pudo crear el rack'), 'error');
      }
    } catch (error) {
      console.error('Error creando rack:', error);
      notificar('Error de conexión al crear el rack', 'error');
    }
  }

  async deleteServer(serverId, serverName) {
    if (this.isReadOnlyUser()) {
      this.notifyReadOnly();
      return;
    }

    const aceptado = await confirmAction({
      title: 'Eliminar servidor',
      message: `¿Eliminar el servidor "${serverName}"? Esta accion no se puede deshacer.`,
      confirmText: 'Eliminar servidor',
      tone: 'danger'
    });
    if (!aceptado) return;

    try {
      const response = await fetch(`/api/servers/${encodeURIComponent(serverId)}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));

      if (response.ok) {
        notificar('Servidor eliminado correctamente', 'success');
        await this.recargarVista();
        window.location.hash = '';
      } else {
        notificar(result.error || 'Error eliminando servidor', 'error');
      }
    } catch (error) {
      console.error('Error eliminando servidor:', error);
      notificar('Error de conexión al eliminar', 'error');
    }
  }
}

// Una sola instancia global
function iniciar() {
  window.serverManager = new ServerManager();
  window.serverManager.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}

export default ServerManager;
