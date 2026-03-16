export function escapeHtml(value) {
  const str = (value ?? '').toString();
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatearUsuarioFila(user) {
  const id = Number(user.id) || 0;
  const username = escapeHtml(user.username || '');
  const nombre = escapeHtml(user.name || '');
  const email = escapeHtml(user.email || '');
  const role = escapeHtml(user.role || 'viewer');
  const estado = user.active ? 'Activo' : 'Inactivo';
  const ultimoLogin = user.last_login
    ? new Date(user.last_login).toLocaleString('es-ES')
    : 'Nunca';

  return `
    <tr>
      <td><strong>${username}</strong></td>
      <td>${nombre}</td>
      <td>${email || '—'}</td>
      <td><span class="user-role ${role}">${role}</span></td>
      <td>
        <span class="user-status ${user.active ? 'active' : 'inactive'}"></span>
        ${estado}
      </td>
      <td>${escapeHtml(ultimoLogin)}</td>
      <td>
        <div class="user-actions">
          <button class="btn-edit" data-action="editar" data-user-id="${id}">✏️ Editar</button>
          <button class="btn-edit" data-action="password" data-user-id="${id}">🔑 Contraseña</button>
          <button class="btn-delete" data-action="eliminar" data-user-id="${id}" data-username="${username}">🗑️ Eliminar</button>
        </div>
      </td>
    </tr>
  `;
}
