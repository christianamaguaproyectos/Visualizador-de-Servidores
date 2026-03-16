/**
 * Script de autenticación para frontend
 * Maneja logout y validación de sesión
 */

// Obtener información del usuario actual
async function loadUserInfo() {
  try {
    const response = await fetch('/api/auth/user');
    const data = await response.json();

    if (data.success && data.user) {
      // Actualizar nombre de usuario en la interfaz
      const userNameElement = document.getElementById('userName');
      if (userNameElement) {
        userNameElement.textContent = `👤 ${data.user.name} (${data.user.role})`;
      }

      // Guardar rol en variable global para uso posterior
      window.currentUser = data.user;

      // Ocultar elementos de admin si el usuario es viewer
      if (data.user.role === 'viewer') {
        hideAdminElements();
      }
    }
  } catch (error) {
    console.error('Error al cargar usuario:', error);
  }
}

// Ocultar elementos de admin para usuarios viewer
function hideAdminElements() {
  // Ocultar botones de upload
  const uploadButtons = document.querySelectorAll('.btn-upload, [data-admin-only]');
  uploadButtons.forEach(btn => {
    btn.style.display = 'none';
  });
}

// Manejar logout
async function handleLogout() {
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      // Redirigir a login
      window.location.href = '/login';
    } else {
      showToast('Error al cerrar sesión', 'error');
    }
  } catch (error) {
    console.error('Error en logout:', error);
    showToast('Error de conexión', 'error');
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  // Cargar info del usuario
  loadUserInfo();

  // Configurar botón de logout si existe (soportar ambos IDs para compatibilidad)
  const logoutBtn = document.getElementById('logoutBtn') || document.getElementById('btnLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Verificar sesión periódicamente (cada 5 minutos)
  setInterval(checkSession, 5 * 60 * 1000);
});

// Verificar si la sesión sigue activa
async function checkSession() {
  try {
    const response = await fetch('/api/auth/session');
    const data = await response.json();

    if (!data.authenticated) {
      // Sesión expirada - redirigir a login
      showToast('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.', 'warning', 5000);
      window.location.href = '/login';
    }
  } catch (error) {
    console.error('Error al verificar sesión:', error);
  }
}
