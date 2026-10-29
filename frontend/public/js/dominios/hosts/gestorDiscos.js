const ESTILO_FILA_DISCO = 'display:grid;grid-template-columns:70px 70px 1fr 1fr 40px;gap:8px;align-items:center;margin-bottom:8px;padding:8px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0';
const ESTILO_INPUT_DISCO = 'padding:6px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:13px';
const ESTILO_BOTON_ELIMINAR_DISCO = 'padding:4px 8px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;font-size:16px';

function crearFilaDisco(slot = '', cantidad = '', capacidad = '', fru = '') {
  const fila = document.createElement('div');
  fila.className = 'disco-row';
  fila.style.cssText = ESTILO_FILA_DISCO;

  const inputSlot = document.createElement('input');
  inputSlot.type = 'text';
  inputSlot.className = 'disco-slot';
  inputSlot.placeholder = 'Slot';
  inputSlot.value = String(slot || '');
  inputSlot.style.cssText = ESTILO_INPUT_DISCO;
  inputSlot.title = 'Slot del disco (ej: 1, 2, A1)';

  const inputCantidad = document.createElement('input');
  inputCantidad.type = 'number';
  inputCantidad.className = 'disco-cantidad';
  inputCantidad.placeholder = 'Cant.';
  inputCantidad.value = String(cantidad || '');
  inputCantidad.min = '1';
  inputCantidad.style.cssText = ESTILO_INPUT_DISCO;
  inputCantidad.title = 'Cantidad de discos';

  const inputCapacidad = document.createElement('input');
  inputCapacidad.type = 'text';
  inputCapacidad.className = 'disco-capacidad';
  inputCapacidad.placeholder = 'Capacidad';
  inputCapacidad.value = String(capacidad || '');
  inputCapacidad.style.cssText = ESTILO_INPUT_DISCO;
  inputCapacidad.title = 'Ej: 3.84TB, 2.4TB';

  const inputFru = document.createElement('input');
  inputFru.type = 'text';
  inputFru.className = 'disco-fru';
  inputFru.placeholder = 'FRU (separar con coma si hay varios)';
  inputFru.value = String(fru || '');
  inputFru.style.cssText = ESTILO_INPUT_DISCO;
  inputFru.title = 'Ej: 02PX542 o 02PX539, 03JK402';

  const botonEliminar = document.createElement('button');
  botonEliminar.type = 'button';
  botonEliminar.className = 'disco-remove';
  botonEliminar.style.cssText = ESTILO_BOTON_ELIMINAR_DISCO;
  botonEliminar.title = 'Eliminar disco';
  botonEliminar.textContent = '🗑️';
  botonEliminar.addEventListener('click', () => fila.remove());

  fila.appendChild(inputSlot);
  fila.appendChild(inputCantidad);
  fila.appendChild(inputCapacidad);
  fila.appendChild(inputFru);
  fila.appendChild(botonEliminar);
  return fila;
}

export function inicializarGestorDiscos({
  idContenedor = 'discosContainer',
  idBotonAgregar = 'btnAddDisco'
} = {}) {
  const contenedor = document.getElementById(idContenedor);
  const botonAgregar = document.getElementById(idBotonAgregar);

  function agregarDisco(slot = '', cantidad = '', capacidad = '', fru = '') {
    if (!contenedor) return;
    contenedor.appendChild(crearFilaDisco(slot, cantidad, capacidad, fru));
  }

  // Agrega una fila nueva vacía: autonumera el slot y deja la cantidad en 1.
  function agregarDiscoNuevo() {
    if (!contenedor) return;
    const siguienteSlot = contenedor.querySelectorAll('.disco-row').length + 1;
    agregarDisco(String(siguienteSlot), '1', '', '');
  }

  function obtenerDiscosComoJson() {
    if (!contenedor) return '';
    const filas = contenedor.querySelectorAll('.disco-row');
    const discos = [];
    filas.forEach((fila) => {
      const slot = fila.querySelector('.disco-slot')?.value?.trim();
      const cantidad = fila.querySelector('.disco-cantidad')?.value?.trim();
      const capacidad = fila.querySelector('.disco-capacidad')?.value?.trim();
      const fru = fila.querySelector('.disco-fru')?.value?.trim();
      if (slot || cantidad || capacidad || fru) {
        discos.push({
          slot: slot || null,
          cantidad: cantidad ? parseInt(cantidad, 10) : null,
          capacidad,
          fru
        });
      }
    });
    return discos.length > 0 ? JSON.stringify(discos) : '';
  }

  function poblarDiscos(valorDiscos) {
    if (!contenedor) return;
    contenedor.innerHTML = '';
    if (!valorDiscos) return;

    try {
      const discos = JSON.parse(valorDiscos);
      if (Array.isArray(discos)) {
        discos.forEach((disco) => agregarDisco(
          disco.slot || '',
          disco.cantidad || '',
          disco.capacidad || '',
          disco.fru || ''
        ));
        return;
      }
    } catch {
      agregarDisco('', '', valorDiscos, '');
    }
  }

  botonAgregar?.addEventListener('click', agregarDiscoNuevo);

  return {
    agregarDisco,
    agregarDiscoNuevo,
    obtenerDiscosComoJson,
    poblarDiscos
  };
}
