/**
 * Módulo para drag-and-drop de servidores en racks
 * Mejorado con feedback visual, ghost badge, y sin confirm() bloqueantes
 */

class RackDragDrop {
  constructor() {
    this.draggedServer = null;
    this.draggedElement = null;
    this.sourceRack = null;
    this.dropIndicator = null;
    this.ghostEl = null;
  }

  /**
   * Inicializa el drag-and-drop en todos los servidores
   */
  init() {
    this.setupDragListeners();
    this.createDropIndicator();
    console.log('✅ Drag-and-drop inicializado');
  }

  /**
   * Crea un indicador visual fijo en la parte inferior
   */
  createDropIndicator() {
    this.dropIndicator = document.createElement('div');
    this.dropIndicator.className = 'drag-drop-indicator';
    document.body.appendChild(this.dropIndicator);
  }

  /**
   * Muestra el indicador con un mensaje
   */
  showIndicator(message) {
    if (this.dropIndicator) {
      this.dropIndicator.textContent = message;
      this.dropIndicator.style.display = 'block';
    }
  }

  /**
   * Oculta el indicador
   */
  hideIndicator() {
    if (this.dropIndicator) {
      this.dropIndicator.style.display = 'none';
    }
  }

  /**
   * Configura los event listeners para drag-and-drop
   */
  setupDragListeners() {
    // Delegar eventos a nivel de documento para elementos dinámicos
    document.addEventListener('dragstart', (e) => this.handleDragStart(e));
    document.addEventListener('dragend', (e) => this.handleDragEnd(e));
    document.addEventListener('dragover', (e) => this.handleDragOver(e));
    document.addEventListener('drop', (e) => this.handleDrop(e));
    document.addEventListener('dragenter', (e) => this.handleDragEnter(e));
    document.addEventListener('dragleave', (e) => this.handleDragLeave(e));
  }

  /**
   * Crea un ghost badge para mostrar durante el arrastre
   */
  createDragGhost(name) {
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = name;
    // Position off-screen so it renders but isn't visible in flow
    ghost.style.position = 'absolute';
    ghost.style.top = '-1000px';
    ghost.style.left = '-1000px';
    document.body.appendChild(ghost);
    this.ghostEl = ghost;
    return ghost;
  }

  /**
   * Elimina el ghost badge
   */
  removeDragGhost() {
    if (this.ghostEl) {
      this.ghostEl.remove();
      this.ghostEl = null;
    }
  }

  /**
   * Inicia el arrastre de un servidor
   */
  handleDragStart(e) {
    // Buscar tanto .server-item (vista detalle) como .rack-unit.active (vista grid)
    const serverElement = e.target.closest('.server-item') || e.target.closest('.rack-unit.active[draggable="true"]');
    if (!serverElement) return;

    this.draggedElement = serverElement;

    // Obtener ID y nombre según el tipo de elemento
    if (serverElement.classList.contains('server-item')) {
      // Vista de detalle
      this.draggedServer = {
        id: serverElement.querySelector('.server-btn-edit')?.getAttribute('data-server-id'),
        name: serverElement.querySelector('.server-name')?.textContent || 'Servidor'
      };
    } else {
      // Vista de grid
      this.draggedServer = {
        id: serverElement.getAttribute('data-server-id'),
        name: serverElement.getAttribute('data-server-name') || 'Servidor'
      };
    }

    // Obtener el rack actual
    const rackDetail = serverElement.closest('.rack-detail');
    const rackGrid = serverElement.closest('.rack');

    if (rackDetail) {
      this.sourceRack = rackDetail.querySelector('h2')?.textContent;
    } else if (rackGrid) {
      this.sourceRack = rackGrid.querySelector('.rack-content h2')?.textContent ||
        decodeURIComponent(rackGrid.getAttribute('data-name') || '');
    }

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.draggedServer.id || '');

    // Custom drag ghost badge
    const ghost = this.createDragGhost(this.draggedServer.name);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);

    // Agregar clase visual (CSS handles the styling)
    serverElement.classList.add('dragging');

    // Mostrar indicador
    this.showIndicator(`Arrastrando: ${this.draggedServer.name}`);

    console.log('📦 Arrastrando servidor:', this.draggedServer.name);
  }

  /**
   * Termina el arrastre
   */
  handleDragEnd(e) {
    const serverElement = e.target.closest('.server-item') || e.target.closest('.rack-unit.active[draggable="true"]');
    if (serverElement) {
      serverElement.classList.remove('dragging');
    }

    // Limpiar clases de drop zones
    document.querySelectorAll('.drop-target').forEach(el => {
      el.classList.remove('drop-target');
    });

    // Ocultar indicador y ghost
    this.hideIndicator();
    this.removeDragGhost();

    this.draggedElement = null;
  }

  /**
   * Permite el drop al pasar sobre un área válida
   */
  handleDragOver(e) {
    const rack = e.target.closest('.rack');
    const rackDetail = e.target.closest('.rack-detail');
    const targetServer = e.target.closest('.server-item, .rack-unit.active[draggable="true"]');
    const emptyUnit = e.target.closest('.rack-unit.inactive');

    if (rack || rackDetail || targetServer || emptyUnit) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      // Actualizar mensaje del indicador
      if (emptyUnit) {
        const unitLabel = emptyUnit.querySelector('.unit-label')?.textContent || '?';
        this.showIndicator(`📍 Soltar en posición ${unitLabel}`);
      } else if (targetServer && targetServer !== this.draggedElement) {
        const targetName = targetServer.querySelector('.server-name')?.textContent ||
          targetServer.getAttribute('data-server-name') || 'servidor';
        this.showIndicator(`🔄 Intercambiar con ${targetName}`);
      } else if (rack) {
        const rackName = rack.querySelector('.rack-content h2')?.textContent ||
          decodeURIComponent(rack.getAttribute('data-name') || 'rack');
        if (rackName !== this.sourceRack) {
          this.showIndicator(`➡️ Mover a ${rackName}`);
        } else {
          this.showIndicator(`📦 Arrastrando: ${this.draggedServer?.name || 'servidor'}`);
        }
      }
    }
  }

  /**
   * Entra en un área de drop
   */
  handleDragEnter(e) {
    const rack = e.target.closest('.rack');
    const rackDetail = e.target.closest('.rack-detail');
    const targetServer = e.target.closest('.server-item, .rack-unit.active[draggable="true"]');
    const emptyUnit = e.target.closest('.rack-unit.inactive');

    // Evitar marcar el elemento que estamos arrastrando
    if (targetServer && targetServer !== this.draggedElement) {
      targetServer.classList.add('drop-target');
    } else if (emptyUnit) {
      emptyUnit.classList.add('drop-target');
    } else if (rack && !rack.contains(this.draggedElement)) {
      rack.classList.add('drop-target');
    } else if (rackDetail && !rackDetail.contains(this.draggedElement)) {
      rackDetail.classList.add('drop-target');
    }
  }

  /**
   * Sale de un área de drop
   */
  handleDragLeave(e) {
    const rack = e.target.closest('.rack');
    const rackDetail = e.target.closest('.rack-detail');
    const targetServer = e.target.closest('.server-item, .rack-unit.active[draggable="true"]');
    const emptyUnit = e.target.closest('.rack-unit.inactive');

    // Solo remover si realmente salimos del elemento
    if (targetServer && !targetServer.contains(e.relatedTarget)) {
      targetServer.classList.remove('drop-target');
    } else if (emptyUnit && !emptyUnit.contains(e.relatedTarget)) {
      emptyUnit.classList.remove('drop-target');
    } else if (rack && !rack.contains(e.relatedTarget)) {
      rack.classList.remove('drop-target');
    } else if (rackDetail && !rackDetail.contains(e.relatedTarget)) {
      rackDetail.classList.remove('drop-target');
    }
  }

  /**
   * Suelta el servidor en un rack o sobre otro servidor
   */
  async handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!this.draggedServer) return;

    // Limpiar clases de drop zones
    document.querySelectorAll('.drop-target').forEach(el => {
      el.classList.remove('drop-target');
    });

    // Verificar si se soltó sobre una unidad vacía (para reposicionar)
    const emptyUnit = e.target.closest('.rack-unit.inactive');

    if (emptyUnit) {
      await this.handleRepositionToEmpty(emptyUnit);
      return;
    }

    // Verificar si se soltó sobre otro servidor (para intercambiar)
    const targetServerElement = e.target.closest('.server-item, .rack-unit.active[draggable="true"]');

    if (targetServerElement && targetServerElement !== this.draggedElement) {
      // Intercambiar posiciones con otro servidor
      await this.handleServerSwap(targetServerElement);
      return;
    }

    // Obtener el rack destino
    let targetRackName = null;
    const rack = e.target.closest('.rack');
    const rackDetail = e.target.closest('.rack-detail');

    if (rack) {
      targetRackName = rack.querySelector('.rack-content h2')?.textContent ||
        rack.getAttribute('data-rack-name');
    } else if (rackDetail) {
      targetRackName = rackDetail.querySelector('h2')?.textContent;
    }

    // Decodificar si viene URL encoded
    if (targetRackName) {
      try {
        targetRackName = decodeURIComponent(targetRackName);
      } catch { }
    }

    if (!targetRackName) {
      console.error('No se pudo determinar el rack destino');
      return;
    }

    // Si es el mismo rack, no hacer nada
    if (targetRackName === this.sourceRack) {
      console.log('ℹ️ Mismo rack, no se requiere mover');
      return;
    }

    // Ejecutar directamente sin confirm()
    await this.moveServerToRack(this.draggedServer.id, targetRackName);
  }

  /**
   * Mueve un servidor a una posición vacía específica
   */
  async handleRepositionToEmpty(emptyUnit) {
    // Obtener la posición de la unidad vacía (número de rack)
    const unitLabel = emptyUnit.querySelector('.unit-label')?.textContent;
    if (!unitLabel) {
      console.error('No se pudo determinar la posición de la unidad');
      return;
    }

    const position = parseInt(unitLabel, 10);
    if (isNaN(position)) {
      console.error('Posición inválida:', unitLabel);
      return;
    }

    // Obtener el rack de la unidad vacía
    const rack = emptyUnit.closest('.rack');
    let targetRackName = null;

    if (rack) {
      targetRackName = rack.querySelector('.rack-content h2')?.textContent ||
        decodeURIComponent(rack.getAttribute('data-rack-name') || '');
    }

    if (!targetRackName) {
      console.error('No se pudo determinar el rack destino');
      return;
    }

    try {
      console.log(`📍 Moviendo servidor ${this.draggedServer.id} a posición ${position} en rack ${targetRackName}...`);

      const response = await fetch(`/api/servers/${this.draggedServer.id}/reposition`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rack_norm: targetRackName,
          rack_raw: targetRackName,
          rack_position: position
        })
      });

      const result = await response.json();

      if (response.ok) {
        console.log('✅ Servidor reposicionado exitosamente');
        if (typeof showToast === 'function') {
          showToast(`"${this.draggedServer.name}" movido a posición ${position}`, 'success');
        }

        // Recargar datos
        if (window.loadAllData) {
          window.loadAllData();
        } else if (window.location.reload) {
          window.location.reload();
        }
      } else {
        console.error('❌ Error:', result.error);
        if (typeof showToast === 'function') {
          showToast(result.error || 'No se pudo reposicionar el servidor', 'error');
        }
      }
    } catch (error) {
      console.error('❌ Error reposicionando servidor:', error);
      if (typeof showToast === 'function') {
        showToast('Error de conexión al reposicionar el servidor', 'error');
      }
    }
  }

  /**
   * Intercambia las posiciones de dos servidores
   */
  async handleServerSwap(targetElement) {
    // Obtener información del servidor destino
    let targetServerId, targetServerName;

    if (targetElement.classList.contains('server-item')) {
      targetServerId = targetElement.querySelector('.server-btn-edit')?.getAttribute('data-server-id');
      targetServerName = targetElement.querySelector('.server-name')?.textContent || 'Servidor';
    } else {
      targetServerId = targetElement.getAttribute('data-server-id');
      targetServerName = targetElement.getAttribute('data-server-name') || 'Servidor';
    }

    if (!targetServerId) {
      console.error('No se pudo obtener ID del servidor destino');
      return;
    }

    try {
      console.log(`🔄 Intercambiando posiciones entre ${this.draggedServer.id} y ${targetServerId}...`);

      const response = await fetch('/api/servers/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server1_id: this.draggedServer.id,
          server2_id: targetServerId
        })
      });

      const result = await response.json();

      if (response.ok) {
        console.log('✅ Servidores intercambiados exitosamente');
        if (typeof showToast === 'function') {
          showToast(`"${this.draggedServer.name}" ↔ "${targetServerName}" intercambiados`, 'success');
        }

        // Recargar datos
        if (window.loadAllData) {
          window.loadAllData();
        } else if (window.location.reload) {
          window.location.reload();
        }
      } else {
        console.error('❌ Error:', result.error);
        if (typeof showToast === 'function') {
          showToast(result.error || 'No se pudo intercambiar los servidores', 'error');
        }
      }
    } catch (error) {
      console.error('❌ Error intercambiando servidores:', error);
      if (typeof showToast === 'function') {
        showToast('Error de conexión al intercambiar servidores', 'error');
      }
    }
  }

  /**
   * Mueve un servidor a otro rack mediante la API
   */
  async moveServerToRack(serverId, newRackName) {
    try {
      console.log(`🚚 Moviendo servidor ${serverId} a rack ${newRackName}...`);

      const response = await fetch(`/api/servers/${serverId}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rack_norm: newRackName,
          rack_raw: newRackName
        })
      });

      const result = await response.json();

      if (response.ok) {
        console.log('✅ Servidor movido exitosamente');
        if (typeof showToast === 'function') {
          showToast(`"${this.draggedServer?.name}" movido a "${newRackName}"`, 'success');
        }

        // Recargar datos
        if (window.loadAllData) {
          window.loadAllData();
        } else if (window.location.reload) {
          window.location.reload();
        }
      } else {
        console.error('❌ Error:', result.error);
        if (typeof showToast === 'function') {
          showToast(result.error || 'No se pudo mover el servidor', 'error');
        }
      }
    } catch (error) {
      console.error('❌ Error moviendo servidor:', error);
      if (typeof showToast === 'function') {
        showToast('Error de conexión al mover el servidor', 'error');
      }
    }
  }
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.rackDragDrop = new RackDragDrop();
    window.rackDragDrop.init();
  });
} else {
  window.rackDragDrop = new RackDragDrop();
  window.rackDragDrop.init();
}

export default RackDragDrop;
