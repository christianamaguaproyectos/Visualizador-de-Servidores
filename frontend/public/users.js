/**
 * Gestión de Usuarios - Frontend
 */

import { formatearUsuarioFila } from '/js/dominios/usuarios/presentacionUsuarios.js';

let users = [];
let editingUserId = null;

// Cargar usuarios al iniciar
document.addEventListener('DOMContentLoaded', () => {
  loadUsers();
  setupEventListeners();
});

/**
 * Configura event listeners
 */
function setupEventListeners() {
  document.getElementById('btnAddUser').addEventListener('click', () => openUserModal());
  document.getElementById('btnCancelModal').addEventListener('click', closeUserModal);
  document.getElementById('btnCancelPassword').addEventListener('click', closePasswordModal);
  document.getElementById('userForm').addEventListener('submit', handleUserSubmit);
  document.getElementById('passwordForm').addEventListener('submit', handlePasswordSubmit);

  // Cerrar modales al hacer clic fuera
  document.getElementById('userModal').addEventListener('click', (e) => {
    if (e.target.id === 'userModal') closeUserModal();
  });
  document.getElementById('passwordModal').addEventListener('click', (e) => {
    if (e.target.id === 'passwordModal') closePasswordModal();
  });

  // Delegación de acciones de tabla para evitar onclick inline
  document.getElementById('usersTableBody').addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const userId = Number(button.dataset.userId);
    if (!Number.isInteger(userId) || userId <= 0) return;

    if (action === 'editar') {
      editUser(userId);
      return;
    }
    if (action === 'password') {
      changePassword(userId);
      return;
    }
    if (action === 'eliminar') {
      const username = button.dataset.username || 'usuario';
      deleteUser(userId, username);
    }
  });
}

/**
 * Carga usuarios desde la API
 */
async function loadUsers() {
  try {
    const response = await fetch('/api/users');
    const data = await response.json();

    users = data.users || [];
    renderUsers();
  } catch (error) {
    console.error('Error cargando usuarios:', error);
    showToast('Error cargando usuarios', 'error');
  }
}

/**
 * Renderiza la tabla de usuarios
 */
function renderUsers() {
  const tbody = document.getElementById('usersTableBody');

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <h3>No hay usuarios</h3>
            <p>Agrega el primer usuario para comenzar</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.map((user) => formatearUsuarioFila(user)).join('');
}

/**
 * Abre modal para agregar/editar usuario
 */
function openUserModal(userId = null) {
  editingUserId = userId;
  const modal = document.getElementById('userModal');
  const title = document.getElementById('modalTitle');
  const passwordGroup = document.getElementById('passwordGroup');
  const passwordInput = document.getElementById('password');

  if (userId) {
    // Modo edición
    const user = users.find(u => u.id === userId);
    if (!user) return;

    title.textContent = 'Editar Usuario';
    document.getElementById('userId').value = user.id;
    document.getElementById('username').value = user.username;
    document.getElementById('username').disabled = true; // No permitir cambiar username
    document.getElementById('name').value = user.name;
    document.getElementById('email').value = user.email || '';
    document.getElementById('role').value = user.role;

    // En edición, la contraseña es opcional
    passwordGroup.style.display = 'none';
    passwordInput.required = false;
  } else {
    // Modo creación
    title.textContent = 'Agregar Usuario';
    document.getElementById('userForm').reset();
    document.getElementById('username').disabled = false;
    passwordGroup.style.display = 'block';
    passwordInput.required = true;
  }

  modal.classList.add('show');
}

/**
 * Cierra modal de usuario
 */
function closeUserModal() {
  document.getElementById('userModal').classList.remove('show');
  document.getElementById('userForm').reset();
  editingUserId = null;
}

/**
 * Maneja el submit del formulario de usuario
 */
async function handleUserSubmit(e) {
  e.preventDefault();

  const username = document.getElementById('username').value;
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const role = document.getElementById('role').value;
  const password = document.getElementById('password').value;

  try {
    let response;

    if (editingUserId) {
      // Actualizar usuario existente
      response = await fetch(`/api/users/${editingUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role })
      });
    } else {
      // Crear nuevo usuario
      response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, name, email, role, password })
      });
    }

    const result = await response.json();

    if (response.ok) {
      showToast(editingUserId ? 'Usuario actualizado exitosamente' : 'Usuario creado exitosamente', 'success');
      closeUserModal();
      loadUsers();
    } else {
      showToast('Error: ' + (result.error || 'No se pudo guardar el usuario'), 'error');
    }
  } catch (error) {
    console.error('Error guardando usuario:', error);
    showToast('Error de conexión al guardar usuario', 'error');
  }
}

/**
 * Edita un usuario
 */
function editUser(userId) {
  openUserModal(userId);
}

/**
 * Abre modal para cambiar contraseña
 */
function changePassword(userId) {
  document.getElementById('passwordUserId').value = userId;
  document.getElementById('passwordModal').classList.add('show');
  document.getElementById('passwordForm').reset();
}

/**
 * Cierra modal de contraseña
 */
function closePasswordModal() {
  document.getElementById('passwordModal').classList.remove('show');
  document.getElementById('passwordForm').reset();
}

/**
 * Maneja el submit del formulario de cambio de contraseña
 */
async function handlePasswordSubmit(e) {
  e.preventDefault();

  const userId = document.getElementById('passwordUserId').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (newPassword !== confirmPassword) {
    showToast('Las contraseñas no coinciden', 'warning');
    return;
  }

  try {
    const response = await fetch(`/api/users/${userId}/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword })
    });

    const result = await response.json();

    if (response.ok) {
      showToast('Contraseña actualizada exitosamente', 'success');
      closePasswordModal();
    } else {
      showToast('Error: ' + (result.error || 'No se pudo cambiar la contraseña'), 'error');;
    }
  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    showToast('Error de conexión al cambiar contraseña', 'error');
  }
}

/**
 * Elimina (desactiva) un usuario
 */
async function deleteUser(userId, username) {
  if (!confirm(`¿Estás seguro de desactivar al usuario "${username}"?`)) {
    return;
  }

  try {
    const response = await fetch(`/api/users/${userId}`, {
      method: 'DELETE'
    });

    const result = await response.json();

    if (response.ok) {
      showToast('Usuario desactivado exitosamente', 'success');
      loadUsers();
    } else {
      showToast('Error: ' + (result.error || 'No se pudo eliminar el usuario'), 'error');
    }
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    showToast('Error de conexión al eliminar usuario', 'error');
  }
}
