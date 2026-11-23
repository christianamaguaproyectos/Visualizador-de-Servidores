/**
 * Exportación del diagrama: SVG, PNG ×2 y JSON del 2D; PNG del 3D.
 * Las descargas usan blob: (img-src blob: está permitido por la CSP).
 */

function marcaTiempo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function nombreArchivo(slug, ext) {
  const limpio = String(slug || 'vista').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return `topologia-${limpio}-${marcaTiempo()}.${ext}`;
}

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.className = 'is-hidden';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportarSVG(textoSvg, slug) {
  descargar(new Blob([textoSvg], { type: 'image/svg+xml;charset=utf-8' }), nombreArchivo(slug, 'svg'));
}

/** SVG → Image (blob URL) → canvas ×2 → PNG */
export function exportarPNGDesdeSVG(textoSvg, slug, escala = 2) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([textoSvg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.ceil(img.naturalWidth * escala);
      c.height = Math.ceil(img.naturalHeight * escala);
      const g = c.getContext('2d');
      g.scale(escala, escala);
      g.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      c.toBlob((blob) => {
        if (!blob) { reject(new Error('No se pudo generar el PNG')); return; }
        descargar(blob, nombreArchivo(slug, 'png'));
        resolve();
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo rasterizar el SVG')); };
    img.src = url;
  });
}

export function exportarCanvasPNG(canvas, slug) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('No se pudo generar el PNG')); return; }
      descargar(blob, nombreArchivo(slug, 'png'));
      resolve();
    }, 'image/png');
  });
}

/** JSON: { view, nodes:[{id,name,type,ip,position}], edges } */
export function exportarJSON(estado) {
  const nodos = estado.nodosVisibles();
  const datos = {
    view: estado.vista,
    nodes: nodos.map((n) => ({ id: n.id, name: n.name, type: n.type, ip: n.ip, position: estado.posiciones.get(String(n.id)) || null })),
    edges: estado.aristasVisibles(nodos),
  };
  descargar(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }), nombreArchivo(estado.vista?.slug, 'json'));
}
