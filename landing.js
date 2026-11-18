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

fetch('/api/me', { credentials: 'same-origin' })
  .then((response) => response.ok ? response.json() : null)
  .then((session) => {
    if (!session?.authenticated || !session.profile || !homeAccount) return;
    const name = session.profile.name || session.user;
    document.querySelector('#homeProfileTriggerAvatar').textContent = String(name).trim().charAt(0).toUpperCase() || '?';
    document.querySelector('#homeProfileName').textContent = name;
    document.querySelector('#homeProfileUsername').textContent = `@${session.user}`;
    document.querySelector('#homeProfileRole').textContent = session.role === 'admin' ? 'ADMINISTRATOR' : 'PENGGUNA';
    homeAccount.hidden = false;
    if (homeLoginButton) homeLoginButton.hidden = true;
  })
  .catch(() => {});

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
