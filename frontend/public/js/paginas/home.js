// Lógica de home.html (antes inline; extraída para la CSP estricta, Fase 4.2)
// Mostrar botón de gestión de usuarios solo para administradores
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.server-type-card[data-nav-target]').forEach((card) => {
    const navigate = () => {
      const target = card.getAttribute('data-nav-target');
      if (target) {
        location.href = target;
      }
    };

    card.addEventListener('click', navigate);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        navigate();
      }
    });
  });

  const btnUsers = document.getElementById('btnUsers');

  // Reutilizamos la info que carga auth.js en window.currentUser
  const enableUsersButton = () => {
    if (!btnUsers || !window.currentUser) return;
    if (window.currentUser.isSuperAdmin) {
      btnUsers.style.display = 'inline-block';
      if (!btnUsers._wired) {
        btnUsers.addEventListener('click', () => { location.href = '/users'; });
        btnUsers._wired = true;
      }
    }
  };

  // Intento inmediato (por si loadUserInfo ya terminó)
  enableUsersButton();

  // Fallback: pequeño polling corto mientras se carga el usuario
  let attempts = 0;
  const intervalId = setInterval(() => {
    attempts++;
    enableUsersButton();
    if (window.currentUser || attempts > 20) {
      clearInterval(intervalId);
    }
  }, 100);
});
