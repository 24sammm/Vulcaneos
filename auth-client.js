document.querySelectorAll('[data-toggle-password]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.togglePassword);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.setAttribute('aria-label', show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
    button.innerHTML = `<i class="fa-regular ${show ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
  });
});

const loginForm = document.querySelector('#loginForm');
if (loginForm) {
  const status = document.querySelector('#loginStatus');
  const submit = loginForm.querySelector('[type="submit"]');
  if (new URLSearchParams(window.location.search).get('registered') === '1') {
    status.textContent = 'Akun berhasil dibuat. Silakan masuk dengan ID pengguna dan kata sandi Anda.';
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = 'Memeriksa kredensial…';
    submit.disabled = true;
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          username: loginForm.elements.username.value,
          password: loginForm.elements.password.value,
          remember: loginForm.elements.remember.checked,
        }),
      });
      const responseText = await response.text();
      let result;
      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error('Endpoint autentikasi tidak mengirim respons JSON. Jalankan aplikasi dengan `npm start` atau `vercel dev`, bukan Live Server.');
      }
      if (!responseText) {
        throw new Error('Endpoint autentikasi mengirim respons kosong. Jalankan aplikasi dengan `npm start` atau `vercel dev`, bukan Live Server.');
      }
      if (!response.ok) throw new Error(result.error || 'ID atau kata sandi tidak sesuai.');
      window.location.assign(result.role === 'admin' ? '/webgis.html' : '/index.html');
    } catch (error) {
      status.textContent = error.message === 'Failed to fetch'
        ? 'Server autentikasi belum berjalan. Jalankan server dengan npm start.'
        : error.message;
    } finally {
      submit.disabled = false;
    }
  });

  fetch('/api/me', { credentials: 'same-origin' })
    .then((response) => response.ok ? response.json() : null)
    .then((session) => {
      if (session?.authenticated) window.location.assign(session.role === 'admin' ? '/webgis.html' : '/index.html');
    })
    .catch(() => {});
}

const registerForm = document.querySelector('#registerForm');
if (registerForm) {
  const status = document.querySelector('#registerStatus');
  const submit = registerForm.querySelector('[type="submit"]');
  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);
    const password = String(formData.get('password') || '');
    if (password !== String(formData.get('confirmPassword') || '')) {
      status.textContent = 'Konfirmasi kata sandi tidak cocok.';
      return;
    }
    status.textContent = 'Membuat akun…';
    submit.disabled = true;
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });
      const responseText = await response.text();
      let result;
      try { result = responseText ? JSON.parse(responseText) : {}; }
      catch { throw new Error('Server registrasi mengirim respons yang tidak valid.'); }
      if (!response.ok) throw new Error(result.error || 'Registrasi gagal diproses.');
      window.location.assign('/login.html?registered=1');
    } catch (error) {
      status.textContent = error.message === 'Failed to fetch'
        ? 'Server registrasi belum berjalan. Coba lagi beberapa saat lagi.'
        : error.message;
    } finally {
      submit.disabled = false;
    }
  });
}

document.querySelectorAll('[data-auth-placeholder]').forEach((button) => {
  button.addEventListener('click', () => {
    const status = button.closest('form')?.querySelector('.auth-status')
      || document.querySelector('#loginStatus');
    if (status) status.textContent = 'Pemulihan kata sandi belum diaktifkan. Hubungi administrator.';
  });
});

