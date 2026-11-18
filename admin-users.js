(() => {
  const rows = document.querySelector('#userRows');
  const status = document.querySelector('#userStatus');
  const count = document.querySelector('#userCount');
  const search = document.querySelector('#userSearch');
  const refresh = document.querySelector('#refreshUsers');
  const empty = document.querySelector('#userEmpty');
  if (!rows || !status || !count || !search || !refresh || !empty) return;

  let users = [];

  function showStatus(message, tone = '') {
    status.textContent = message;
    if (tone) status.dataset.tone = tone;
    else status.removeAttribute('data-tone');
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }

  function renderUsers() {
    const term = search.value.trim().toLowerCase();
    const filtered = users.filter((user) => (
      [user.name, user.username, user.email, user.institution].some((value) => String(value || '').toLowerCase().includes(term))
    ));
    rows.replaceChildren();
    count.textContent = String(users.length);
    empty.hidden = filtered.length !== 0;
    if (!users.length) showStatus('Belum ada akun hasil registrasi.');
    else if (term && !filtered.length) showStatus('Tidak ada akun yang cocok dengan pencarian.');
    else showStatus(`${filtered.length} dari ${users.length} akun ditampilkan.`);

    filtered.forEach((user) => {
      const row = document.createElement('tr');
      const identity = document.createElement('td');
      const name = document.createElement('span');
      name.className = 'admin-user-name';
      name.textContent = user.name || user.username;
      const username = document.createElement('span');
      username.className = 'admin-user-username';
      username.textContent = `@${user.username}`;
      identity.append(name, username);
      if (user.bio) {
        const bio = document.createElement('small');
        bio.className = 'admin-user-bio';
        bio.textContent = user.bio;
        identity.append(bio);
      }

      const email = document.createElement('td');
      email.textContent = user.email || '—';
      const institution = document.createElement('td');
      institution.textContent = user.institution || '—';
      const joined = document.createElement('td');
      joined.textContent = formatDate(user.joinedAt);
      const action = document.createElement('td');
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'admin-user-delete';
      deleteButton.dataset.deleteUsername = user.username;
      deleteButton.innerHTML = '<i class="fa-regular fa-trash-can" aria-hidden="true"></i> Hapus akun';
      action.append(deleteButton);
      row.append(identity, email, institution, joined, action);
      rows.append(row);
    });
  }

  async function loadUsers() {
    refresh.disabled = true;
    refresh.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>';
    showStatus('Memuat daftar akun…');
    try {
      const response = await fetch('/api/admin/users', { credentials: 'same-origin' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Daftar akun gagal dimuat.');
      users = Array.isArray(payload.users) ? payload.users : [];
      renderUsers();
    } catch (error) {
      showStatus(error.message === 'Failed to fetch'
        ? 'Tidak dapat menghubungi server pengelolaan akun.'
        : error.message, 'error');
    } finally {
      refresh.disabled = false;
      refresh.innerHTML = '<i class="fa-solid fa-rotate" aria-hidden="true"></i>';
    }
  }

  search.addEventListener('input', renderUsers);
  refresh.addEventListener('click', loadUsers);
  rows.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-username]');
    if (!button) return;
    const username = button.dataset.deleteUsername;
    if (!window.confirm(`Hapus akun @${username}? Topik dan komentar akan tetap ada, tetapi identitas penulisnya menjadi anonim. Tindakan ini tidak dapat dibatalkan.`)) return;

    button.disabled = true;
    try {
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Akun gagal dihapus.');
      users = users.filter((user) => user.username !== username);
      renderUsers();
      showStatus(`Akun @${username} dihapus. Konten forum terkait telah dianonimkan.`);
    } catch (error) {
      showStatus(error.message === 'Failed to fetch'
        ? 'Tidak dapat menghubungi server. Coba muat ulang daftar.'
        : error.message, 'error');
      button.disabled = false;
    }
  });

  loadUsers();
})();
