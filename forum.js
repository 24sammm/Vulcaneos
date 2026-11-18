(() => {
  const list = document.querySelector('#forumThreadList');
  if (!list) return;

  const composeToggle = document.querySelector('#forumComposeToggle');
  const threadForm = document.querySelector('#forumThreadForm');
  const threadStatus = document.querySelector('#forumThreadStatus');
  const authNote = document.querySelector('#forumAuthNote');
  const threadCount = document.querySelector('#forumThreadCount');
  const detail = document.querySelector('#forumThreadDetail');
  const placeholder = document.querySelector('#forumPlaceholder');
  const backButton = document.querySelector('#forumBackButton');
  const replyForm = document.querySelector('#forumReplyForm');
  const replyStatus = document.querySelector('#forumReplyStatus');
  const detailAuthNote = document.querySelector('#forumDetailAuthNote');

  let session = null;
  let forumVisitorToken = null;
  let threads = [];
  let activeThreadId = null;
  let threadRequest = 0;
  const guestDeleteTokens = new Map();
  const guestTokenStorageKey = (threadId) => `vulcaneos:guest-thread-delete:${threadId}`;

  const formatDate = (iso) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date);
  };

  const initials = (name) => String(name || '?').trim().charAt(0).toUpperCase();

  function getForumVisitorToken() {
    if (forumVisitorToken) return forumVisitorToken;
    const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
    try {
      const saved = window.localStorage.getItem('vulcaneos:forum-visitor');
      if (tokenPattern.test(saved || '')) {
        forumVisitorToken = saved;
        return forumVisitorToken;
      }
    } catch (error) {
      console.warn('Identitas pengunjung tidak dapat dibaca dari penyimpanan browser.', error);
    }

    if (!window.crypto?.getRandomValues) return '';
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    forumVisitorToken = window.btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    try {
      window.localStorage.setItem('vulcaneos:forum-visitor', forumVisitorToken);
    } catch (error) {
      console.warn('Identitas pengunjung hanya berlaku selama halaman ini terbuka.', error);
    }
    return forumVisitorToken;
  }

  function status(element, message, tone = '') {
    if (!element) return;
    element.textContent = message || '';
    element.dataset.tone = tone;
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { ...(options.headers || {}), 'X-Forum-Visitor': getForumVisitorToken() },
    });
    const raw = await response.text();
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch { throw new Error('Server forum mengirim respons yang tidak valid.'); }
    if (!response.ok) throw new Error(payload.error || 'Permintaan forum gagal diproses.');
    return payload;
  }

  function getGuestDeleteToken(threadId) {
    if (guestDeleteTokens.has(threadId)) return guestDeleteTokens.get(threadId);
    try {
      return window.localStorage.getItem(guestTokenStorageKey(threadId));
    } catch (error) {
      console.warn('Token penghapusan anonim tidak dapat dibaca dari penyimpanan browser.', error);
      return null;
    }
  }

  function saveGuestDeleteToken(threadId, token) {
    guestDeleteTokens.set(threadId, token);
    try {
      window.localStorage.setItem(guestTokenStorageKey(threadId), token);
      return true;
    } catch (error) {
      console.warn('Token penghapusan anonim hanya tersimpan selama halaman ini terbuka.', error);
      return false;
    }
  }

  function removeGuestDeleteToken(threadId) {
    guestDeleteTokens.delete(threadId);
    try {
      window.localStorage.removeItem(guestTokenStorageKey(threadId));
    } catch (error) {
      console.warn('Token penghapusan anonim tidak dapat dihapus dari penyimpanan browser.', error);
    }
  }

  const canDelete = (author, threadId, isThread = false) => Boolean(
    (session?.authenticated && (session.role === 'admin' || session.user === author?.username))
    || (isThread && author?.role === 'guest' && getGuestDeleteToken(threadId))
  );

  function updateAuthUi() {
    const signedIn = Boolean(session?.authenticated);
    if (authNote) {
      authNote.replaceChildren();
      if (signedIn) {
        authNote.textContent = `Masuk sebagai ${session.profile?.name || session.user}. Anda dapat membuat topik, berkomentar, menyukai diskusi, dan menghapus komentar Anda sendiri.`;
      } else {
        authNote.append('Masuk untuk membuat topik atau menyukai diskusi. Pengunjung anonim tetap dapat berkomentar. ');
        const link = document.createElement('a');
        link.href = 'login.html';
        link.textContent = 'Masuk / Daftar';
        authNote.append(link, '.');
      }
    }
    if (composeToggle) {
      composeToggle.hidden = !signedIn;
      composeToggle.innerHTML = 'Mulai diskusi <i class="fa-solid fa-plus" aria-hidden="true"></i>';
      composeToggle.setAttribute('aria-expanded', String(!threadForm?.hidden));
    }
    if (detailAuthNote) {
      detailAuthNote.replaceChildren();
      if (!signedIn) {
        detailAuthNote.append('Pengunjung dapat berkomentar, tetapi komentar anonim hanya dapat dihapus oleh admin. ');
        const link = document.createElement('a');
        link.href = 'login.html';
        link.textContent = 'Masuk / Daftar';
        detailAuthNote.append(link, ' untuk memakai akun.');
      } else {
        detailAuthNote.textContent = 'Anda dapat menghapus komentar sendiri. Admin dapat menghapus semua komentar.';
      }
    }
  }

  function renderThreads() {
    list.replaceChildren();
    if (threadCount) threadCount.textContent = threads.length ? `${threads.length} diskusi` : 'Belum ada diskusi';
    if (!threads.length) {
      const empty = document.createElement('p');
      empty.className = 'hm-forum-empty';
      empty.textContent = 'Belum ada diskusi. Mulai percakapan pertama tentang kawasan ini.';
      list.append(empty);
      return;
    }
    threads.forEach((thread) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hm-forum-thread';
      if (thread.id === activeThreadId) button.classList.add('is-active');
      button.setAttribute('aria-label', `Buka diskusi ${thread.title}`);

      const top = document.createElement('span');
      top.className = 'hm-forum-thread-top';
      const avatar = document.createElement('span');
      avatar.className = 'hm-forum-avatar';
      avatar.textContent = initials(thread.author?.name);
      const author = document.createElement('span');
      author.className = 'hm-forum-thread-author';
      author.textContent = thread.author?.name || 'Pengguna';
      const date = document.createElement('span');
      date.className = 'hm-forum-thread-date';
      date.textContent = formatDate(thread.lastActivity || thread.createdAt);
      top.append(avatar, author, date);

      const title = document.createElement('span');
      title.className = 'hm-forum-thread-title';
      title.textContent = thread.title;

      const excerpt = document.createElement('span');
      excerpt.className = 'hm-forum-thread-excerpt';
      excerpt.textContent = thread.excerpt;

      const foot = document.createElement('span');
      foot.className = 'hm-forum-thread-foot';
      const replies = document.createElement('span');
      replies.innerHTML = '<i class="fa-regular fa-comment" aria-hidden="true"></i>';
      replies.append(` ${thread.replyCount} balasan`);
      const likes = document.createElement('span');
      likes.innerHTML = '<i class="fa-regular fa-heart" aria-hidden="true"></i>';
      likes.append(` ${thread.likeCount || 0} suka`);
      foot.append(replies, likes);

      button.append(top, title, excerpt, foot);
      button.addEventListener('click', () => openThread(thread.id));
      list.append(button);
    });
  }

  function renderThread(thread) {
    detail.hidden = false;
    if (placeholder) placeholder.hidden = true;

    const meta = document.querySelector('#forumDetailMeta');
    const title = document.querySelector('#forumDetailTitle');
    const body = document.querySelector('#forumDetailBody');
    const repliesWrap = document.querySelector('#forumReplies');
    const authorContext = thread.author?.institution
      || (thread.author?.role === 'guest' ? 'Tanpa akun' : 'Pengguna VOLCANEOS');
    if (meta) meta.textContent = `${thread.author?.name || 'Pengguna'} · ${authorContext} · ${formatDate(thread.createdAt)}`;
    if (title) title.textContent = thread.title;
    if (body) body.textContent = thread.body;
    repliesWrap.replaceChildren();

    const heading = document.createElement('div');
    heading.className = 'hm-forum-replies-head';
    const count = document.createElement('b');
    count.textContent = `${thread.replies.length} balasan`;
    heading.append(count);
    const like = document.createElement(session?.authenticated ? 'button' : 'a');
    if (session?.authenticated) like.type = 'button';
    like.className = `hm-forum-like${thread.likedByMe ? ' is-liked' : ''}`;
    like.setAttribute('aria-label', session?.authenticated
      ? thread.likedByMe ? 'Batalkan suka' : 'Sukai diskusi'
      : 'Masuk untuk menyukai diskusi');
    if (session?.authenticated) like.setAttribute('aria-pressed', String(Boolean(thread.likedByMe)));
    else like.href = 'login.html';
    const likeIcon = document.createElement('i');
    likeIcon.className = `fa-${thread.likedByMe ? 'solid' : 'regular'} fa-heart`;
    likeIcon.setAttribute('aria-hidden', 'true');
    like.append(likeIcon, ` ${thread.likeCount || 0} suka`);
    if (session?.authenticated) {
      like.addEventListener('click', async () => {
        like.disabled = true;
        try {
          await requestJson('/api/forum', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'toggle-like', threadId: thread.id }),
          });
          await openThread(thread.id, false);
          await loadThreads();
        } catch (error) {
          window.alert(error.message);
          like.disabled = false;
        }
      });
    }
    heading.append(like);
    if (canDelete(thread.author, thread.id, true)) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'hm-forum-delete';
      remove.textContent = 'Hapus diskusi';
      remove.addEventListener('click', async () => {
        if (!window.confirm('Hapus diskusi ini beserta seluruh balasannya?')) return;
        remove.disabled = true;
        try {
          await requestJson('/api/forum', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'delete-thread',
              threadId: thread.id,
              deleteToken: thread.author?.role === 'guest' ? getGuestDeleteToken(thread.id) : undefined,
            }),
          });
          if (thread.author?.role === 'guest') removeGuestDeleteToken(thread.id);
          closeThread();
          await loadThreads();
        } catch (error) {
          window.alert(error.message);
          remove.disabled = false;
        }
      });
      heading.append(remove);
    }
    repliesWrap.append(heading);

    if (!thread.replies.length) {
      const empty = document.createElement('p');
      empty.className = 'hm-forum-empty';
      empty.textContent = 'Belum ada balasan. Jadilah yang pertama menanggapi.';
      repliesWrap.append(empty);
    }

    thread.replies.forEach((reply) => {
      const item = document.createElement('article');
      item.className = 'hm-forum-reply';
      const top = document.createElement('div');
      top.className = 'hm-forum-reply-top';
      const avatar = document.createElement('span');
      avatar.className = 'hm-forum-avatar';
      avatar.textContent = initials(reply.author?.name);
      const who = document.createElement('span');
      const name = document.createElement('b');
      name.textContent = reply.author?.name || 'Pengguna';
      const when = document.createElement('small');
      const replyContext = reply.author?.role === 'guest'
        ? 'Tanpa akun'
        : reply.author?.institution || 'Pengguna VOLCANEOS';
      when.textContent = `${replyContext} · ${formatDate(reply.createdAt)}`;
      who.append(name, when);
      top.append(avatar, who);
      if (session?.authenticated && (session.role === 'admin' || session.user === reply.author?.username)) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'hm-forum-delete';
        remove.textContent = 'Hapus komentar';
        remove.addEventListener('click', async () => {
          if (!window.confirm('Hapus balasan ini?')) return;
          remove.disabled = true;
          try {
            await requestJson('/api/forum', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'delete-reply', replyId: reply.id }),
            });
            await openThread(thread.id, false);
            await loadThreads();
          } catch (error) {
            window.alert(error.message);
            remove.disabled = false;
          }
        });
        top.append(remove);
      }
      const text = document.createElement('p');
      text.className = 'hm-forum-reply-body';
      text.textContent = reply.body;
      item.append(top, text);
      repliesWrap.append(item);
    });

    if (replyForm) {
      replyForm.hidden = false;
      replyForm.reset();
      replyForm.dataset.threadId = String(thread.id);
      status(replyStatus, '');
    }
    updateAuthUi();
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeThread() {
    activeThreadId = null;
    if (detail) detail.hidden = true;
    if (placeholder) placeholder.hidden = false;
    renderThreads();
  }

  async function openThread(id, scroll = true) {
    activeThreadId = id;
    renderThreads();
    const requestId = ++threadRequest;
    if (placeholder) placeholder.hidden = true;
    if (detail) detail.hidden = false;
    const title = document.querySelector('#forumDetailTitle');
    if (title) title.textContent = 'Memuat diskusi…';
    try {
      const payload = await requestJson(`/api/forum?threadId=${encodeURIComponent(id)}`);
      if (requestId !== threadRequest) return;
      renderThread(payload.thread);
      if (!scroll) detail.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    } catch (error) {
      if (requestId !== threadRequest) return;
      closeThread();
      if (threadCount) threadCount.textContent = error.message;
    }
  }

  async function loadThreads() {
    list.replaceChildren();
    const loading = document.createElement('p');
    loading.className = 'hm-forum-empty';
    loading.textContent = 'Memuat diskusi…';
    list.append(loading);
    try {
      const payload = await requestJson('/api/forum');
      threads = Array.isArray(payload.threads) ? payload.threads : [];
      renderThreads();
      if (threads.length && activeThreadId) {
        const current = threads.find((thread) => thread.id === activeThreadId);
        if (!current) closeThread();
      }
    } catch (error) {
      list.replaceChildren();
      const message = document.createElement('p');
      message.className = 'hm-forum-empty';
      message.textContent = error.message;
      list.append(message);
      if (threadCount) threadCount.textContent = 'Forum belum aktif';
    }
  }

  composeToggle?.addEventListener('click', () => {
    if (!threadForm) return;
    threadForm.hidden = !threadForm.hidden;
    composeToggle.setAttribute('aria-expanded', String(!threadForm.hidden));
    if (!threadForm.hidden) document.querySelector('#forumThreadTitle')?.focus();
  });

  backButton?.addEventListener('click', closeThread);

  threadForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = threadForm.querySelector('[type="submit"]');
    const data = new FormData(threadForm);
    const title = String(data.get('title') || '').trim();
    const body = String(data.get('body') || '').trim();
    if (title.length < 5 || body.length < 5) {
      status(threadStatus, 'Judul minimal 5 karakter dan isi minimal 5 karakter.', 'error');
      return;
    }
    const guestPost = !session?.authenticated;
    submit.disabled = true;
    status(threadStatus, guestPost ? 'Mengirim diskusi sebagai Pengunjung…' : 'Mengirim diskusi…');
    try {
      const payload = await requestJson('/api/forum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-thread', title, body }),
      });
      const guestTokenPersisted = guestPost && payload.deleteToken
        ? saveGuestDeleteToken(payload.id, payload.deleteToken)
        : false;
      threadForm.reset();
      threadForm.hidden = true;
      composeToggle?.setAttribute('aria-expanded', 'false');
      status(threadStatus, '');
      await loadThreads();
      await openThread(payload.id);
      if (guestPost) {
        authNote.textContent = !payload.deleteToken
          ? 'Diskusi dibuat sebagai Pengunjung. Hanya admin yang dapat menghapusnya.'
          : guestTokenPersisted
            ? 'Diskusi dibuat sebagai Pengunjung. Anda dapat menghapusnya dari browser ini.'
            : 'Diskusi dibuat sebagai Pengunjung. Token hapus hanya tersimpan selama halaman ini terbuka; jangan tutup halaman sebelum selesai.';
      }
    } catch (error) {
      status(threadStatus, error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  replyForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = replyForm.querySelector('[type="submit"]');
    const threadId = replyForm.dataset.threadId || '';
    const body = String(new FormData(replyForm).get('body') || '').trim();
    if (!threadId) return;
    if (body.length < 2) {
      status(replyStatus, 'Balasan minimal 2 karakter.', 'error');
      return;
    }
    submit.disabled = true;
    status(replyStatus, 'Mengirim balasan…');
    try {
      await requestJson('/api/forum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-reply', threadId, body }),
      });
      replyForm.reset();
      await openThread(threadId, false);
      await loadThreads();
    } catch (error) {
      status(replyStatus, error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  (async () => {
    try {
      const response = await fetch('/api/me', { credentials: 'same-origin' });
      if (response.ok) session = await response.json();
    } catch {
      session = null;
    }
    updateAuthUi();
    await loadThreads();
  })();
})();
