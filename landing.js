const menuButton = document.querySelector('.landing-menu-toggle');
const landingLinks = document.querySelector('.landing-links');

menuButton?.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Buka navigasi' : 'Tutup navigasi');
  menuButton.innerHTML = `<i class="fa-solid ${isOpen ? 'fa-bars' : 'fa-xmark'}"></i>`;
  landingLinks.classList.toggle('nav-open', !isOpen);
});

landingLinks?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  menuButton?.setAttribute('aria-expanded', 'false');
  menuButton?.setAttribute('aria-label', 'Buka navigasi');
  if (menuButton) menuButton.innerHTML = '<i class="fa-solid fa-bars"></i>';
  landingLinks.classList.remove('nav-open');
}));

document.querySelectorAll('[data-enter-webgis]').forEach((button) => {
  button.addEventListener('click', () => window.location.assign('login.html'));
});

const homeAccount = document.querySelector('#homeAccount');
const homeLoginButton = document.querySelector('#homeLoginButton');
const homeProfileButton = document.querySelector('#homeProfileButton');
const homeProfileMenu = document.querySelector('#homeProfileMenu');
const homeLogoutButton = document.querySelector('#homeLogoutButton');
const homeProfileEditToggle = document.querySelector('#homeProfileEditToggle');
const homeProfileEditForm = document.querySelector('#homeProfileEditForm');
const homeProfileEditStatus = document.querySelector('#homeProfileEditStatus');
let homeSession = null;

function renderHomeProfile() {
  if (!homeSession?.profile) return;
  const name = homeSession.profile.name || homeSession.user;
  document.querySelector('#homeProfileTriggerAvatar').textContent = String(name).trim().charAt(0).toUpperCase() || '?';
  document.querySelector('#homeProfileName').textContent = name;
  document.querySelector('#homeProfileUsername').textContent = `@${homeSession.user}`;
  document.querySelector('#homeProfileRole').textContent = homeSession.role === 'admin' ? 'ADMINISTRATOR' : 'PENGGUNA';
  if (homeProfileEditForm) {
    homeProfileEditForm.elements.name.value = name;
    homeProfileEditForm.elements.institution.value = homeSession.profile.institution || '';
    homeProfileEditForm.elements.bio.value = homeSession.profile.bio || '';
  }
}

fetch('/api/me', { credentials: 'same-origin' })
  .then((response) => response.ok ? response.json() : null)
  .then((session) => {
    if (!session?.authenticated || !session.profile || !homeAccount) return;
    homeSession = session;
    renderHomeProfile();
    homeAccount.hidden = false;
    if (homeLoginButton) homeLoginButton.hidden = true;
  })
  .catch(() => {});

homeProfileEditToggle?.addEventListener('click', () => {
  if (!homeProfileEditForm) return;
  homeProfileEditForm.hidden = !homeProfileEditForm.hidden;
  homeProfileEditToggle.setAttribute('aria-expanded', String(!homeProfileEditForm.hidden));
  if (!homeProfileEditForm.hidden) homeProfileEditForm.elements.name.focus();
});

homeProfileEditForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = homeProfileEditForm.querySelector('[type="submit"]');
  homeProfileEditStatus.removeAttribute('data-tone');
  homeProfileEditStatus.textContent = 'Menyimpan profil…';
  submit.disabled = true;
  try {
    const response = await fetch('/api/profile', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: homeProfileEditForm.elements.name.value,
        institution: homeProfileEditForm.elements.institution.value,
        bio: homeProfileEditForm.elements.bio.value,
      }),
    });
    const raw = await response.text();
    let payload;
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      payload = parsed && typeof parsed === 'object' ? parsed : {};
    }
    catch { throw new Error('Server profil mengirim respons yang tidak valid.'); }
    if (!response.ok) throw new Error(payload.error || 'Profil gagal disimpan.');
    if (!payload.profile) throw new Error('Respons profil tidak memuat data yang diperbarui.');
    homeSession = { ...homeSession, profile: { ...homeSession.profile, ...payload.profile } };
    renderHomeProfile();
    homeProfileEditStatus.textContent = 'Profil berhasil diperbarui.';
  } catch (error) {
    homeProfileEditStatus.dataset.tone = 'error';
    homeProfileEditStatus.textContent = error.message === 'Failed to fetch'
      ? 'Tidak dapat menghubungi server profil. Coba lagi.'
      : error.message;
  } finally {
    submit.disabled = false;
  }
});

homeProfileButton?.addEventListener('click', () => {
  const isOpen = homeProfileMenu.hidden;
  homeProfileMenu.hidden = !isOpen;
  homeProfileButton.setAttribute('aria-expanded', String(isOpen));
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.home-account') && homeProfileMenu && !homeProfileMenu.hidden) {
    homeProfileMenu.hidden = true;
    homeProfileButton?.setAttribute('aria-expanded', 'false');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && homeProfileMenu && !homeProfileMenu.hidden) {
    homeProfileMenu.hidden = true;
    homeProfileButton?.setAttribute('aria-expanded', 'false');
    homeProfileButton?.focus();
  }
});

homeLogoutButton?.addEventListener('click', async () => {
  homeLogoutButton.disabled = true;
  try {
    const response = await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Logout gagal.');
    window.location.assign('index.html');
  } catch {
    homeLogoutButton.disabled = false;
    window.alert('Tidak dapat menghubungi server autentikasi. Coba lagi.');
  }
});

const homeThemeToggle = document.querySelector('[data-home-theme-toggle]');
if (homeThemeToggle) {
  const themeRoot = document.documentElement;
  const themeColor = document.querySelector('meta[name="theme-color"]');

  const updateHomeThemeControl = () => {
    const isNight = themeRoot.dataset.homeTheme === 'night';
    homeThemeToggle.setAttribute('aria-pressed', String(isNight));
    homeThemeToggle.setAttribute('aria-label', isNight ? 'Aktifkan mode terang' : 'Aktifkan Night mode');
    homeThemeToggle.innerHTML = isNight
      ? '<i class="fa-solid fa-sun" aria-hidden="true"></i><span>Mode terang</span>'
      : '<i class="fa-regular fa-moon" aria-hidden="true"></i><span>Night mode</span>';
    if (themeColor) themeColor.content = isNight ? '#101820' : '#f4f3ee';
  };

  updateHomeThemeControl();
  homeThemeToggle.addEventListener('click', () => {
    const nextTheme = themeRoot.dataset.homeTheme === 'night' ? 'current' : 'night';
    themeRoot.dataset.homeTheme = nextTheme;
    updateHomeThemeControl();
    try {
      localStorage.setItem('vulcaneos-home-theme', nextTheme);
    } catch (error) {
      console.warn('Preferensi tema beranda tidak dapat disimpan.', error);
    }
  });
}

const revealTargets = document.querySelectorAll(
  '.landing-copy, .landing-visual, .editorial-heading, .landing-about article, .landing-background article, .content-hero, .story-aside, .story-copy, .purpose-card, .purpose-note, .page-cta, .section-intro, .data-item, .data-footnote, .landing-method > div, .landing-method > p, .landing-text-link, .home-landing [data-reveal], [data-reveal]',
);
revealTargets.forEach((element) => element.setAttribute('data-reveal', ''));

if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.14 });
  revealTargets.forEach((element) => revealObserver.observe(element));
} else {
  revealTargets.forEach((element) => element.classList.add('is-visible'));
}
