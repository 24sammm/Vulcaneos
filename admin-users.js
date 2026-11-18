(() => {
  const rows = document.querySelector('#userRows');
  const status = document.querySelector('#userStatus');
  const count = document.querySelector('#userCount');
  const search = document.querySelector('#userSearch');
  const refresh = document.querySelector('#refreshUsers');
  const empty = document.querySelector('#userEmpty');
  const notificationForm = document.querySelector('#adminNotificationForm');
  const notificationStatus = document.querySelector('#notificationStatus');
  const sendNotificationButton = document.querySelector('#sendNotificationButton');
  const recipientPicker = document.querySelector('#notificationRecipientPicker');
  const recipientSearch = document.querySelector('#notificationRecipientSearch');
  const recipientList = document.querySelector('#notificationRecipientList');
  const recipientCount = document.querySelector('#notificationRecipientCount');
  if (!rows || !status || !count || !search || !refresh || !empty
    || !notificationForm || !notificationStatus || !sendNotificationButton
    || !recipientPicker || !recipientSearch || !recipientList || !recipientCount) return;

  let users = [];
  let usersLoaded = false;
  const selectedRecipients = new Set();

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

  function showNotificationStatus(message, tone = '') {
    notificationStatus.textContent = message;
    if (tone) notificationStatus.dataset.tone = tone;
    else notificationStatus.removeAttribute('data-tone');
  }

  function renderRecipientOptions() {
    const term = recipientSearch.value.trim().toLowerCase();
    const filtered = users.filter((user) => (
      [user.name, user.username].some((value) => String(value || '').toLowerCase().includes(term))
    ));
    recipientList.replaceChildren();
    filtered.forEach((user) => {
      const label = document.createElement('label');
      label.className = 'admin-notification-recipient';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedRecipients.has(user.username);
      checkbox.dataset.recipientUsername = user.username;
      const identity = document.createElement('span');
      identity.textContent = `${user.name || user.username} (@${user.username})`;
      label.append(checkbox, identity);
      recipientList.append(label);
    });
    recipientCount.textContent = `${selectedRecipients.size} dipilih`;
    if (!filtered.length) {
      const empty = document.createElement('span');
      empty.className = 'admin-notification-recipient-empty';
      empty.textContent = users.length ? 'Tidak ada user yang cocok.' : 'Belum ada akun registrasi.';
      recipientList.append(empty);
    }
  }

  function updateRecipientMode() {
    recipientPicker.hidden = notificationForm.elements.recipientMode.value !== 'selected';
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
      usersLoaded = true;
      renderUsers();
      renderRecipientOptions();
    } catch (error) {
      showStatus(error.message === 'Failed to fetch'
        ? 'Tidak dapat menghubungi server pengelolaan akun.'
        : error.message, 'error');
    } finally {
      refresh.disabled = false;
      refresh.innerHTML = '<i class="fa-solid fa-rotate" aria-hidden="true"></i>';
      sendNotificationButton.disabled = !usersLoaded;
    }
  }

  search.addEventListener('input', renderUsers);
  recipientSearch.addEventListener('input', renderRecipientOptions);
  notificationForm.querySelectorAll('[name="recipientMode"]').forEach((input) => {
    input.addEventListener('change', updateRecipientMode);
  });
  recipientList.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-recipient-username]');
    if (!checkbox) return;
    if (checkbox.checked) selectedRecipients.add(checkbox.dataset.recipientUsername);
    else selectedRecipients.delete(checkbox.dataset.recipientUsername);
    recipientCount.textContent = `${selectedRecipients.size} dipilih`;
  });
  notificationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const recipientMode = notificationForm.elements.recipientMode.value;
    const usernames = recipientMode === 'selected' ? [...selectedRecipients] : [];
    if (recipientMode === 'selected' && !usernames.length) {
      showNotificationStatus('Pilih setidaknya satu user penerima.', 'error');
      return;
    }
    const audience = recipientMode === 'all' ? 'semua akun registrasi' : `${usernames.length} user terpilih`;
    if (!window.confirm(`Kirim informasi kepada ${audience}?`)) return;

    sendNotificationButton.disabled = true;
    showNotificationStatus('Mengirim informasi…');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-notification',
          title: notificationForm.elements.title.value,
          message: notificationForm.elements.message.value,
          recipientMode,
          usernames,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Informasi gagal dikirim.');
      notificationForm.reset();
      selectedRecipients.clear();
      recipientSearch.value = '';
      updateRecipientMode();
      renderRecipientOptions();
      showNotificationStatus(`Informasi berhasil dikirim ke ${payload.sentCount} user.`);
    } catch (error) {
      showNotificationStatus(error.message === 'Failed to fetch'
        ? 'Tidak dapat menghubungi server pengelolaan akun.'
        : error.message, 'error');
    } finally {
      sendNotificationButton.disabled = !usersLoaded;
    }
  });
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
      selectedRecipients.delete(username);
      renderUsers();
      renderRecipientOptions();
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
