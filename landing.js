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
