// Lógica de login.html (antes inline; extraída para la CSP estricta, Fase 4.2)
// Tomar el token de recuperación y QUITARLO de la barra de direcciones de inmediato
// (así no queda en el historial ni se comparte por error al copiar la URL)
const resetTokenDesdeUrl = new URLSearchParams(window.location.search).get('resetToken');
if (resetTokenDesdeUrl) {
  window.history.replaceState({}, '', '/login');
}

// Password visibility toggle
document.getElementById('togglePassword').addEventListener('click', () => {
  const pwd = document.getElementById('password');
  const icon = document.getElementById('eyeIcon');
  if (pwd.type === 'password') {
    pwd.type = 'text';
    icon.innerHTML = '<path d="M3 3L21 21"/><path d="M10.55 10.56A2.5 2.5 0 0014 14"/><path d="M9.9 5.2C10.58 5.07 11.28 5 12 5c6.2 0 10 7 10 7a19.29 19.29 0 01-3.03 3.85"/><path d="M6.1 6.13C3.76 7.86 2 12 2 12s3.8 7 10 7c1.95 0 3.62-.57 5.03-1.42"/>';
  } else {
    pwd.type = 'password';
    icon.innerHTML = '<path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.8"/>';
  }
});

document.getElementById('forgotPasswordBtn').addEventListener('click', async () => {
  const identifier = window.prompt('Ingresa tu usuario o correo para recuperar la contraseña:');
  if (!identifier || !identifier.trim()) return;

  try {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ identifier: identifier.trim() })
    });

    const data = await response.json();
    if (response.ok && data.success) {
      showError('Si la cuenta existe, te enviamos instrucciones de recuperación al correo registrado.');

      if (data.debugToken) {
        console.info('Token de recuperación (solo desarrollo):', data.debugToken);
      }
    } else {
      showError(data.message || 'No fue posible iniciar el proceso de recuperación.');
    }
  } catch (_) {
    showError('Error de conexión. Verifica tu red e intenta nuevamente.');
  }
});

function tryPasswordResetFromUrl() {
  const token = resetTokenDesdeUrl;
  if (!token) return;

  const dialog = document.getElementById('resetDialog');
  const form = document.getElementById('resetForm');
  const campoClave = document.getElementById('resetPassword');
  const campoConfirmar = document.getElementById('resetPasswordConfirm');
  const errorEl = document.getElementById('resetError');
  const btnGuardar = document.getElementById('resetSubmit');

  const mostrarErrorReset = (mensaje) => {
    errorEl.textContent = mensaje;
    errorEl.hidden = false;
  };

  document.getElementById('resetCancel').addEventListener('click', () => {
    form.reset();
    dialog.close();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;

    const password = campoClave.value;
    if (password.length < 8 || password.length > 256) {
      mostrarErrorReset('La contraseña debe tener entre 8 y 256 caracteres.');
      campoClave.focus();
      return;
    }
    if (password !== campoConfirmar.value) {
      mostrarErrorReset('Las contraseñas no coinciden.');
      campoConfirmar.focus();
      return;
    }

    btnGuardar.disabled = true;
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        form.reset();
        dialog.close();
        showError('Contraseña actualizada correctamente. Ya puedes iniciar sesión.');
      } else {
        mostrarErrorReset(data.message || 'El enlace de recuperación no es válido o expiró.');
      }
    } catch (_) {
      mostrarErrorReset('Error de conexión. Verifica tu red e intenta nuevamente.');
    } finally {
      btnGuardar.disabled = false;
    }
  });

  dialog.showModal();
  campoClave.focus();
}

// Manejo del formulario de login
const loginForm = document.getElementById('loginForm');
const btnLogin = document.getElementById('btnLogin');
const btnText = document.getElementById('btnText');
const btnLoader = document.getElementById('btnLoader');
const errorMessage = document.getElementById('errorMessage');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Deshabilitar botón y mostrar loader
  btnLogin.disabled = true;
  btnText.style.display = 'none';
  btnLoader.style.display = 'inline-block';
  errorMessage.style.display = 'none';

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (data.success) {
      // Login exitoso - redirigir a home
      window.location.href = '/';
    } else {
      // Login fallido - mostrar error
      showError(data.message || 'Usuario o contraseña incorrectos');
    }
  } catch (error) {
    showError('Error de conexión. Verifica tu red e intenta nuevamente.');
  } finally {
    // Re-habilitar botón
    btnLogin.disabled = false;
    btnText.style.display = 'inline';
    btnLoader.style.display = 'none';
  }
});

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';

  // Animar el error
  errorMessage.style.animation = 'none';
  setTimeout(() => {
    errorMessage.style.animation = 'shake 0.5s';
  }, 10);
}

tryPasswordResetFromUrl();
