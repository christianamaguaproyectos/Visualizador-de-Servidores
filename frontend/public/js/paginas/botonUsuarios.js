// Botón "Usuarios" solo para superadmin en index.html y virtual.html (antes inline duplicado; Fase 4.2)
// Mostrar botón de usuarios solo para superadmin
document.addEventListener('DOMContentLoaded', () => {
  const btnUsers = document.getElementById('btnUsers');
  if (!btnUsers) return;
  // Al salir de la página el navegador cancela la petición: no es un error real
  let saliendo = false;
  window.addEventListener('pagehide', () => { saliendo = true; });
  window.addEventListener('beforeunload', () => { saliendo = true; });

  fetch('/api/auth/user')
    .then((response) => response.json())
    .then((data) => {
      if (data?.success && data?.user?.isSuperAdmin) {
        btnUsers.style.display = 'inline-block';
        btnUsers.addEventListener('click', () => location.href = '/users');
      }
    })
    .catch((e) => {
      if (e?.name === 'AbortError' || (saliendo && e instanceof TypeError)) return;
      console.error('Error checking superadmin role:', e);
    });
});
