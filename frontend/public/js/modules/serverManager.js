/**
 * MÃ³dulo para gestionar servidores (CRUD)
 */

class ServerManager {
  constructor() {
    this.currentType = window.location.pathname.includes('virtual') ? 'virtuales' : 'fisicos';
    this.racks = [];
    this.editingServerId = null;
  }

  /**
   * Inicializa los event listeners
   */
  init() {
    // BotÃ³n agregar servidor
    const btnAddServer = document.getElementById('btnAddServer');
    if (btnAddServer) {
      btnAddServer.addEventListener('click', () => this.openServerModal());
    }

    // BotÃ³n agregar rack
    const btnAddRack = document.getElementById('btnAddRack');
    if (btnAddRack) {
      btnAddRack.addEventListener('click', () => this.openRackModal());
    }

    // Modal servidor
    const serverModalClose = document.getElementById('serverModalClose');
    if (serverModalClose) {
      serverModalClose.addEventListener('click', () => this.closeServerModal());
    }

    const serverFormCancel = document.getElementById('serverFormCancel');
    if (serverFormCancel) {
      serverFormCancel.addEventListener('click', () => this.closeServerModal());
    }

    const serverForm = document.getElementById('serverForm');
    if (serverForm) {
      serverForm.addEventListener('submit', (e) => this.handleServerSubmit(e));
    }

    // Modal rack
    const rackAddModalClose = document.getElementById('rackAddModalClose');
    if (rackAddModalClose) {
      rackAddModalClose.addEventListener('click', () => this.closeRackModal());
    }

    const rackFormCancel = document.getElementById('rackFormCancel');
    if (rackFormCancel) {
      rackFormCancel.addEventListener('click', () => this.closeRackModal());
    }

    const rackForm = document.getElementById('rackForm');
    if (rackForm && this.currentType !== 'virtuales') {
      rackForm.addEventListener('submit', (e) => this.handleRackSubmit(e));
    }

    // Cargar racks al inicio
    this.loadRacks();
  }

  /**
   * Carga la lista de racks para el selector
   */
  async loadRacks() {
    try {
      const response = await fetch(`/api/racks?type=${this.currentType}`);
      const racks = await response.json();
      this.racks = racks;
    } catch (error) {
      console.error('Error cargando racks:', error);
    }
  }

  /**
   * Abre el modal para agregar/editar servidor
   */
  async openServerModal(serverId = null) {
    this.editingServerId = serverId;

    const modal = document.getElementById('serverModal');
    const title = document.getElementById('serverModalTitle');
    const rackSelect = document.getElementById('serverRack');

    // Actualizar tÃ­tulo
    title.textContent = serverId ? 'Editar Servidor' : (this.currentType === 'virtuales' ? 'Agregar VM' : 'Agregar Servidor');

    // Cargar racks en el selector
    await this.loadRacks();
    rackSelect.innerHTML = '<option value="">Seleccionar rack/host...</option>';
    this.racks.forEach(rack => {
      const option = document.createElement('option');
      option.value = rack.name;
      option.textContent = rack.name;
      rackSelect.appendChild(option);
    });

    // Si es ediciÃ³n, cargar datos del servidor
    if (serverId) {
      await this.loadServerData(serverId);
    } else {
      this.clearServerForm();
    }

    modal.style.display = 'flex';
  }

  /**
   * Carga datos de un servidor para ediciÃ³n
   */
  async loadServerData(serverId) {
    try {
      const response = await fetch(`/api/servers?type=${this.currentType}`);
      const servers = await response.json();
      const server = servers.find(s => s.id == serverId);

      if (server) {
        document.getElementById('serverId').value = server.id;
        document.getElementById('serverNombre').value = server.nombre || '';
        if (document.getElementById('serverLabel')) document.getElementById('serverLabel').value = server.serverLabel || '';
        document.getElementById('serverRack').value = server.rack_norm || server.rack || '';
        document.getElementById('serverUnits').value = server.rack_units || server.rackUnits || 2;
        document.getElementById('serverPosition').value = server.rack_position || server.rackPosition || '';
        document.getElementById('serverIP').value = server.ip || '';
        document.getElementById('serverHostname').value = server.hostname || '';
        document.getElementById('serverUsuario').value = server.usuario || '';
        if (document.getElementById('serverMarca')) document.getElementById('serverMarca').value = server.marca || '';
        if (document.getElementById('serverModelo')) document.getElementById('serverModelo').value = server.modelo || '';
        if (document.getElementById('serverTipo')) document.getElementById('serverTipo').value = server.tipo || '';
        if (document.getElementById('serverSerie')) document.getElementById('serverSerie').value = server.serie || '';
        document.getElementById('serverRAM').value = server.ram_gb || server.ramGb || '';
        if (document.getElementById('serverSocket')) document.getElementById('serverSocket').value = server.socket || '';
        if (document.getElementById('serverNoPorSocket')) document.getElementById('serverNoPorSocket').value = server.no_por_socket || server.noPorSocket || '';
        if (document.getElementById('serverProcLogicos')) document.getElementById('serverProcLogicos').value = server.procesadores_logicos || server.procesadoresLogicos || '';
        // Poblar discos dinÃ¡micos usando la funciÃ³n de app.js
        if (window.populateDiscos) {
          window.populateDiscos(server.discos);
        } else {
          const container = document.getElementById('discosContainer');
          if (container && server.discos) container.innerHTML = '<div style="padding:8px;color:#666">' + server.discos + '</div>';
        }
        if (document.getElementById('serverDatastore')) document.getElementById('serverDatastore').value = server.datastore || '';
        if (document.getElementById('serverConexion')) document.getElementById('serverConexion').value = server.conexion || '';
        document.getElementById('serverSO').value = server.so || '';
        document.getElementById('serverSoftware').value = server.software || '';
        document.getElementById('serverEstado').value = server.estado || 'ACTIVO';
        if (document.getElementById('serverActivo')) document.getElementById('serverActivo').value = server.activo || 'SI';
        if (document.getElementById('serverOperativo')) document.getElementById('serverOperativo').value = server.activo || 'SI';
        if (document.getElementById('serverFechaInstalacion')) document.getElementById('serverFechaInstalacion').value = server.fecha_instalacion || server.fechaInstalacion || '';
        if (document.getElementById('serverFechaMantenimiento')) document.getElementById('serverFechaMantenimiento').value = server.fecha_mantenimiento || server.fechaMantenimiento || '';
        document.getElementById('serverBackup').value = server.backup || '';
        if (document.getElementById('serverFechaBackup')) document.getElementById('serverFechaBackup').value = server.fecha_backup || server.fechaBackup || '';
        // Campos fÃ­sicos
        if (document.getElementById('serverStorage')) document.getElementById('serverStorage').value = server.storage || '';
        if (document.getElementById('serverOcsInventario')) document.getElementById('serverOcsInventario').value = server.ocsInventario || '';
        if (document.getElementById('serverDatastoreVirtuales')) document.getElementById('serverDatastoreVirtuales').value = server.datastoreVirtuales || '';
        if (document.getElementById('serverConexionStorage')) document.getElementById('serverConexionStorage').value = server.conexionStorage || '';
        // Campos virtuales (seguridad)
        if (document.getElementById('serverMtm')) document.getElementById('serverMtm').value = server.mtm || '';
        if (document.getElementById('serverConfigBackup')) document.getElementById('serverConfigBackup').value = server.configBackup || '';
        if (document.getElementById('serverSophosEp')) document.getElementById('serverSophosEp').value = server.sophosEp || '';
        if (document.getElementById('serverVicarius')) document.getElementById('serverVicarius').value = server.vicarius || '';
        if (document.getElementById('serverAcronis')) document.getElementById('serverAcronis').value = server.acronis || '';
        if (document.getElementById('serverVeeam')) document.getElementById('serverVeeam').value = server.veeam || '';
        if (document.getElementById('serverManual')) document.getElementById('serverManual').value = server.manual || '';
        if (document.getElementById('serverZabbix')) document.getElementById('serverZabbix').value = server.zabbix || '';
        if (document.getElementById('serverWazuh')) document.getElementById('serverWazuh').value = server.wazuh || '';
        if (document.getElementById('serverBluelevel')) document.getElementById('serverBluelevel').value = server.bluelevel || '';
        if (document.getElementById('serverPam')) document.getElementById('serverPam').value = server.pam || '';
        if (document.getElementById('serverUsuarioPam')) document.getElementById('serverUsuarioPam').value = server.usuarioPam || '';
      }
    } catch (error) {
      console.error('Error cargando datos del servidor:', error);
    }
  }

  /**
   * Limpia el formulario de servidor
   */
  clearServerForm() {
    document.getElementById('serverId').value = '';
    document.getElementById('serverNombre').value = '';
    if (document.getElementById('serverLabel')) document.getElementById('serverLabel').value = '';
    document.getElementById('serverRack').value = '';
    document.getElementById('serverUnits').value = '2';
    document.getElementById('serverPosition').value = '';
    document.getElementById('serverIP').value = '';
    document.getElementById('serverHostname').value = '';
    document.getElementById('serverUsuario').value = '';
    if (document.getElementById('serverMarca')) document.getElementById('serverMarca').value = '';
    if (document.getElementById('serverModelo')) document.getElementById('serverModelo').value = '';
    if (document.getElementById('serverTipo')) document.getElementById('serverTipo').value = '';
    if (document.getElementById('serverSerie')) document.getElementById('serverSerie').value = '';
    document.getElementById('serverRAM').value = '';
    if (document.getElementById('serverSocket')) document.getElementById('serverSocket').value = '';
    if (document.getElementById('serverNoPorSocket')) document.getElementById('serverNoPorSocket').value = '';
    if (document.getElementById('serverProcLogicos')) document.getElementById('serverProcLogicos').value = '';
    // Limpiar contenedor de discos dinÃ¡micos
    const discosContainer = document.getElementById('discosContainer');
    if (discosContainer) discosContainer.innerHTML = '';
    if (document.getElementById('serverDatastore')) document.getElementById('serverDatastore').value = '';
    if (document.getElementById('serverConexion')) document.getElementById('serverConexion').value = '';
    document.getElementById('serverSO').value = '';
    document.getElementById('serverSoftware').value = '';
    document.getElementById('serverEstado').value = 'NORMAL';
    if (document.getElementById('serverActivo')) document.getElementById('serverActivo').value = 'SI';
    if (document.getElementById('serverOperativo')) document.getElementById('serverOperativo').value = 'SI';
    if (document.getElementById('serverFechaInstalacion')) document.getElementById('serverFechaInstalacion').value = '';
    if (document.getElementById('serverFechaMantenimiento')) document.getElementById('serverFechaMantenimiento').value = '';
    document.getElementById('serverBackup').value = '';
    if (document.getElementById('serverFechaBackup')) document.getElementById('serverFechaBackup').value = '';
    // Campos fÃ­sicos
    if (document.getElementById('serverStorage')) document.getElementById('serverStorage').value = '';
    if (document.getElementById('serverOcsInventario')) document.getElementById('serverOcsInventario').value = '';
    if (document.getElementById('serverDatastoreVirtuales')) document.getElementById('serverDatastoreVirtuales').value = '';
    if (document.getElementById('serverConexionStorage')) document.getElementById('serverConexionStorage').value = '';
    // Campos virtuales (seguridad)
    if (document.getElementById('serverMtm')) document.getElementById('serverMtm').value = '';
    if (document.getElementById('serverConfigBackup')) document.getElementById('serverConfigBackup').value = '';
    if (document.getElementById('serverSophosEp')) document.getElementById('serverSophosEp').value = '';
    if (document.getElementById('serverVicarius')) document.getElementById('serverVicarius').value = '';
    if (document.getElementById('serverAcronis')) document.getElementById('serverAcronis').value = '';
    if (document.getElementById('serverVeeam')) document.getElementById('serverVeeam').value = '';
    if (document.getElementById('serverManual')) document.getElementById('serverManual').value = '';
    if (document.getElementById('serverZabbix')) document.getElementById('serverZabbix').value = '';
    if (document.getElementById('serverWazuh')) document.getElementById('serverWazuh').value = '';
    if (document.getElementById('serverBluelevel')) document.getElementById('serverBluelevel').value = '';
    if (document.getElementById('serverPam')) document.getElementById('serverPam').value = '';
    if (document.getElementById('serverUsuarioPam')) document.getElementById('serverUsuarioPam').value = '';
  }

  /**
   * Cierra el modal de servidor
   */
  closeServerModal() {
    document.getElementById('serverModal').style.display = 'none';
    this.editingServerId = null;
  }

  /**
   * Maneja el envÃ­o del formulario de servidor
   */
  async handleServerSubmit(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }

    const serverId = document.getElementById('serverId')?.value || '';
    const data = {
      type: this.currentType,
      nombre: document.getElementById('serverNombre')?.value || '',
      server_label: document.getElementById('serverLabel')?.value || null,
      rack_norm: document.getElementById('serverRack')?.value || '',
      rack_raw: document.getElementById('serverRack')?.value || '',
      rack_units: parseInt(document.getElementById('serverUnits')?.value) || 2,
      rack_position: document.getElementById('serverPosition')?.value ? parseInt(document.getElementById('serverPosition').value) : null,
      ip: document.getElementById('serverIP')?.value || null,
      hostname: document.getElementById('serverHostname')?.value || null,
      usuario: document.getElementById('serverUsuario')?.value || null,
      marca: document.getElementById('serverMarca')?.value || null,
      modelo: document.getElementById('serverModelo')?.value || null,
      tipo: document.getElementById('serverTipo')?.value || null,
      serie: document.getElementById('serverSerie')?.value || null,
      ram_gb: document.getElementById('serverRAM')?.value || null,
      socket: document.getElementById('serverSocket')?.value || null,
      no_por_socket: document.getElementById('serverNoPorSocket')?.value || null,
      procesadores_logicos: document.getElementById('serverProcLogicos')?.value || null,
      discos: window.getDiscosJSON ? window.getDiscosJSON() : (document.getElementById('serverDiscos')?.value || null),
      datastore: document.getElementById('serverDatastore')?.value || null,
      conexion: document.getElementById('serverConexion')?.value || null,
      so: document.getElementById('serverSO')?.value || null,
      software: document.getElementById('serverSoftware')?.value || null,
      estado: document.getElementById('serverEstado')?.value || 'NORMAL',
      activo: document.getElementById('serverActivo')?.value || document.getElementById('serverOperativo')?.value || 'SI',
      fecha_instalacion: document.getElementById('serverFechaInstalacion')?.value || null,
      fecha_mantenimiento: document.getElementById('serverFechaMantenimiento')?.value || null,
      backup: document.getElementById('serverBackup')?.value || null,
      fecha_backup: document.getElementById('serverFechaBackup')?.value || null,
      // Campos fÃ­sicos
      storage: document.getElementById('serverStorage')?.value || null,
      ocs_inventario: document.getElementById('serverOcsInventario')?.value || null,
      datastore_virtuales: document.getElementById('serverDatastoreVirtuales')?.value || null,
      conexion_storage: document.getElementById('serverConexionStorage')?.value || null,
      // Campos virtuales (seguridad)
      mtm: document.getElementById('serverMtm')?.value || null,
      config_backup: document.getElementById('serverConfigBackup')?.value || null,
      sophos_ep: document.getElementById('serverSophosEp')?.value || null,
      vicarius: document.getElementById('serverVicarius')?.value || null,
      acronis: document.getElementById('serverAcronis')?.value || null,
      veeam: document.getElementById('serverVeeam')?.value || null,
      manual: document.getElementById('serverManual')?.value || null,
      zabbix: document.getElementById('serverZabbix')?.value || null,
      wazuh: document.getElementById('serverWazuh')?.value || null,
      bluelevel: document.getElementById('serverBluelevel')?.value || null,
      pam: document.getElementById('serverPam')?.value || null,
      usuario_pam: document.getElementById('serverUsuarioPam')?.value || null
    };

    try {
      const url = serverId ? `/api/servers/${serverId}` : '/api/servers';
      const method = serverId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (response.ok) {
        showToast(serverId ? 'Servidor actualizado exitosamente' : 'Servidor creado exitosamente', 'success');
        this.closeServerModal();

        // Recargar datos
        if (window.loadAllData) {
          window.loadAllData();
        } else if (window.location.reload) {
          window.location.reload();
        }
      } else {
        showToast('Error: ' + (result.error || 'No se pudo guardar el servidor'), 'error');
      }
    } catch (error) {
      console.error('Error guardando servidor:', error);
      alert('Error de conexiÃ³n al guardar el servidor');
    }
  }

  /**
   * Abre el modal para agregar rack
   */
  openRackModal() {
    document.getElementById('rackName').value = '';
    document.getElementById('rackAddModal').style.display = 'flex';
  }

  /**
   * Cierra el modal de rack
   */
  closeRackModal() {
    document.getElementById('rackAddModal').style.display = 'none';
  }

  /**
   * Maneja el envÃ­o del formulario de rack
   */
  async handleRackSubmit(e) {
    e.preventDefault();

    const data = {
      name: document.getElementById('rackName').value,
      raw_name: document.getElementById('rackName').value
    };

    try {
      const response = await fetch('/api/racks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (response.ok) {
        showToast('Rack/Host creado exitosamente', 'success');
        this.closeRackModal();

        // Recargar datos
        if (window.loadAllData) {
          window.loadAllData();
        } else if (window.location.reload) {
          window.location.reload();
        }
      } else {
        showToast('Error: ' + (result.error || 'No se pudo crear el rack'), 'error');
      }
    } catch (error) {
      console.error('Error creando rack:', error);
      alert('Error de conexiÃ³n al crear el rack');
    }
  }

  /**
   * Elimina un servidor
   */
  async deleteServer(serverId, serverName) {
    if (!confirm(`Â¿EstÃ¡s seguro de eliminar el servidor "${serverName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/servers/${serverId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (response.ok) {
        showToast('Servidor eliminado exitosamente', 'success');

        // Recargar datos
        if (window.loadAllData) {
          window.loadAllData();
        } else if (window.location.reload) {
          window.location.reload();
        }
      } else {
        showToast('Error: ' + (result.error || 'No se pudo eliminar el servidor'), 'error');
      }
    } catch (error) {
      console.error('Error eliminando servidor:', error);
      alert('Error de conexiÃ³n al eliminar el servidor');
    }
  }

  /**
   * Mueve un servidor a otro rack
   */
  async moveServer(serverId, serverName) {
    await this.loadRacks();

    const newRack = prompt(`Mover "${serverName}" a rack:\n\nRacks disponibles:\n${this.racks.map(r => r.name).join('\n')}\n\nIngrese el nombre del rack:`);

    if (!newRack) return;

    try {
      const response = await fetch(`/api/servers/${serverId}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rack_norm: newRack, rack_raw: newRack })
      });

      const result = await response.json();

      if (response.ok) {
        alert(`Servidor movido a ${newRack} exitosamente`);

        // Recargar datos
        if (window.loadAllData) {
          window.loadAllData();
        } else if (window.location.reload) {
          window.location.reload();
        }
      } else {
        alert('Error: ' + (result.error || 'No se pudo mover el servidor'));
      }
    } catch (error) {
      console.error('Error moviendo servidor:', error);
      alert('Error de conexiÃ³n al mover el servidor');
    }
  }
}

// Inicializar cuando el DOM estÃ© listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.serverManager = new ServerManager();
    window.serverManager.init();
  });
} else {
  window.serverManager = new ServerManager();
  window.serverManager.init();
}

export default ServerManager;
