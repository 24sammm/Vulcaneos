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
      window.location.assign(result.role === 'admin' ? '/webgis.html' : '/peta.html');
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
      if (session?.authenticated) window.location.assign(session.role === 'admin' ? '/webgis.html' : '/peta.html');
    })
    .catch(() => {});
}

const accessRequestForm = document.querySelector('#accessRequestForm');
if (accessRequestForm) {
  const status = accessRequestForm.querySelector('.auth-status');
  const submit = accessRequestForm.querySelector('[type="submit"]');
  accessRequestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = 'Mengirim permohonan…';
    submit.disabled = true;
    try {
      const response = await fetch('/api/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(Object.fromEntries(new FormData(accessRequestForm).entries())),
      });
      const responseText = await response.text();
      let result;
      try { result = responseText ? JSON.parse(responseText) : {}; }
      catch { throw new Error('Endpoint permintaan akses tidak aktif. Jalankan dengan `npm start` atau `vercel dev`.'); }
      if (!response.ok) throw new Error(result.error || 'Permintaan gagal dikirim.');
      accessRequestForm.reset();
      status.textContent = 'Permohonan berhasil dikirim ke layanan email untuk diteruskan ke admin.';
    } catch (error) {
      status.textContent = error.message === 'Failed to fetch'
        ? 'Server tidak dapat dihubungi. Jalankan dengan npm start atau vercel dev.'
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

document.querySelectorAll('[data-register-placeholder]').forEach((button) => {
  button.addEventListener('click', () => {
    const status = button.closest('form')?.querySelector('.auth-status');
    if (status) status.textContent = 'Pendaftaran mandiri belum aktif. Hubungi administrator untuk meminta akses.';
  });
});
