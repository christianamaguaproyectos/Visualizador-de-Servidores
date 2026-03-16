const ESTILO_FILA_DISCO = 'display:grid;grid-template-columns:80px 100px 1fr 40px;gap:8px;align-items:center;margin-bottom:8px;padding:8px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0';
const ESTILO_INPUT_DISCO = 'padding:6px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:13px';
const ESTILO_BOTON_ELIMINAR_DISCO = 'padding:4px 8px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;font-size:16px';

function crearFilaDisco(cantidad = '', capacidad = '', fru = '') {
  const fila = document.createElement('div');
  fila.className = 'disco-row';
  fila.style.cssText = ESTILO_FILA_DISCO;

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

  function agregarDisco(cantidad = '', capacidad = '', fru = '') {
    if (!contenedor) return;
    contenedor.appendChild(crearFilaDisco(cantidad, capacidad, fru));
  }

  function obtenerDiscosComoJson() {
    if (!contenedor) return '';
    const filas = contenedor.querySelectorAll('.disco-row');
    const discos = [];
    filas.forEach((fila) => {
      const cantidad = fila.querySelector('.disco-cantidad')?.value?.trim();
      const capacidad = fila.querySelector('.disco-capacidad')?.value?.trim();
      const fru = fila.querySelector('.disco-fru')?.value?.trim();
      if (cantidad || capacidad || fru) {
        discos.push({ cantidad: cantidad ? parseInt(cantidad, 10) : null, capacidad, fru });
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
        discos.forEach((disco) => agregarDisco(disco.cantidad || '', disco.capacidad || '', disco.fru || ''));
        return;
      }
    } catch {
      agregarDisco('', valorDiscos, '');
    }
  }

  botonAgregar?.addEventListener('click', () => agregarDisco());

  return {
    agregarDisco,
    obtenerDiscosComoJson,
    poblarDiscos
  };
}
