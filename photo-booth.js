(() => {
  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#liveBoothCanvas');
  const context = canvas.getContext('2d');
  const video = $('#photoVideo');
  const templates = {};
  const frameOverlays = {};
  const shots = [null, null, null];
  let selectedTemplate = 1;
  let activeSlot = 0;
  let stream = null;
  let capturing = false;
  let outputCanvas = null;
  let renderRequest = 0;
  let activeFilter = 'none';
  let activeOutputSize = 'large';
  let lastLiveRender = 0;
  let liveRenderTimer = 0;

  [1, 2].forEach((number) => {
    const image = new Image();
    image.src = `photoboothtemp${number}.jpeg`;
    image.onload = () => {
      frameOverlays[number] = createFrameOverlay(number);
      scheduleRender();
    };
    templates[number] = image;
  });

  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  function scheduleRender() {
    if (renderRequest) return;
    const complexFilter = ['halftone', 'popart', 'toon', 'retro-black'].includes(activeFilter);
    if (stream && complexFilter) {
      const remaining = 110 - (performance.now() - lastLiveRender);
      if (remaining > 0) {
        if (!liveRenderTimer) liveRenderTimer = window.setTimeout(() => {
          liveRenderTimer = 0;
          scheduleRender();
        }, remaining);
        return;
      }
    }
    renderRequest = window.requestAnimationFrame(() => {
      renderRequest = 0;
      lastLiveRender = performance.now();
      drawLiveCanvas();
    });
  }

  function updateStatus(message, live = Boolean(stream)) {
    $('#photoCameraStatus').querySelector('span').textContent = message;
    $('#photoCameraStatus').classList.toggle('is-live', live);
  }

  function clipWindow(ctx, template, index) {
    ctx.beginPath();
    if (template === 1) {
      const windows = [
        { x: 42, y: 230, w: 341, h: 248 },
        { x: 42, y: 516, w: 341, h: 249 },
        { x: 42, y: 803, w: 341, h: 249 },
      ];
      const { x, y, w, h } = windows[index];
      ctx.rect(x, y, w, h);
      return { x, y, w, h };
    }
    if (index === 0) {
      ctx.moveTo(55, 285);
      ctx.quadraticCurveTo(55, 136, 218, 136);
      ctx.quadraticCurveTo(382, 136, 382, 285);
      ctx.lineTo(382, 432);
      ctx.lineTo(55, 432);
      ctx.closePath();
      return { x: 55, y: 136, w: 327, h: 296 };
    }
    if (index === 1) {
      ctx.rect(55, 445, 327, 258);
      return { x: 55, y: 445, w: 327, h: 258 };
    }
    ctx.roundRect(55, 718, 327, 286, 48);
    return { x: 55, y: 718, w: 327, h: 286 };
  }

  function drawCover(ctx, source, x, y, width, height) {
    const sourceWidth = source.videoWidth || source.width;
    const sourceHeight = source.videoHeight || source.height;
    if (!sourceWidth || !sourceHeight) return;
    const aspect = width / height;
    const sourceAspect = sourceWidth / sourceHeight;
    let sx = 0, sy = 0, sw = sourceWidth, sh = sourceHeight;
    if (sourceAspect > aspect) {
      sw = sourceHeight * aspect;
      sx = (sourceWidth - sw) / 2;
    } else {
      sh = sourceWidth / aspect;
      sy = (sourceHeight - sh) / 2;
    }
    ctx.translate(x + width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
  }

  function preparePhoto(source, width, height, index, filter) {
    const photo = document.createElement('canvas');
    photo.width = Math.max(1, Math.round(width));
    photo.height = Math.max(1, Math.round(height));
    const photoContext = photo.getContext('2d', { willReadFrequently: true });
    photoContext.save();
    drawCover(photoContext, source, 0, 0, photo.width, photo.height);
    photoContext.restore();
    if (!filter || filter === 'none') return photo;

    if (filter === 'mist') {
      const glow = document.createElement('canvas');
      glow.width = photo.width;
      glow.height = photo.height;
      const glowContext = glow.getContext('2d');
      glowContext.filter = 'saturate(.78) contrast(1.04) brightness(.9)';
      glowContext.drawImage(photo, 0, 0);
      glowContext.filter = 'blur(8px) brightness(1.35)';
      glowContext.globalAlpha = .28;
      glowContext.drawImage(photo, -2, -2, photo.width + 4, photo.height + 4);
      glowContext.filter = 'none';
      glowContext.globalAlpha = .2;
      glowContext.globalCompositeOperation = 'screen';
      glowContext.drawImage(photo, 0, 0);
      return glow;
    }

    const image = photoContext.getImageData(0, 0, photo.width, photo.height);
    const data = image.data;
    const palettes = [
      [[20, 49, 76], [0, 158, 169], [244, 103, 69], [247, 205, 108]],
      [[55, 39, 105], [44, 153, 177], [236, 72, 115], [255, 197, 77]],
      [[23, 73, 58], [35, 165, 130], [225, 117, 65], [242, 208, 133]],
    ];
    const palette = palettes[index % palettes.length];
    const luminance = new Float32Array(photo.width * photo.height);
    for (let pixel = 0, offset = 0; pixel < luminance.length; pixel += 1, offset += 4) {
      let r = data[offset], g = data[offset + 1], b = data[offset + 2];
      let y = .2126 * r + .7152 * g + .0722 * b;
      luminance[pixel] = y;
      if (filter === 'halftone') {
        const tone = Math.max(0, Math.min(1, (y - 28) / 220));
        data[offset] = 224 - tone * 95;
        data[offset + 1] = 211 - tone * 87;
        data[offset + 2] = 178 - tone * 62;
      } else if (filter === 'popart') {
        const tone = Math.min(3, Math.floor(y / 64));
        [data[offset], data[offset + 1], data[offset + 2]] = palette[tone];
      } else if (filter === 'toon') {
        const level = Math.round(y / 64) * 64;
        const scale = level / Math.max(1, y);
        data[offset] = Math.min(255, r * scale);
        data[offset + 1] = Math.min(255, g * scale);
        data[offset + 2] = Math.min(255, b * scale);
      } else if (filter === 'retro-black') {
        const x = pixel % photo.width;
        const row = Math.floor(pixel / photo.width);
        const nx = (x / Math.max(1, photo.width - 1) - .5) * 2;
        const ny = (row / Math.max(1, photo.height - 1) - .5) * 2;
        const vignette = Math.max(.58, 1 - (nx * nx + ny * ny) * .19);
        let noise = (pixel + 1) * 374761393;
        noise = (noise ^ (noise >>> 13)) * 1274126177;
        noise ^= noise >>> 16;
        const grain = (((noise >>> 0) / 4294967295) - .5) * 5;
        const mono = Math.max(0, Math.min(255, (y - 112) * 1.22 + 124 + grain)) * vignette;
        data[offset] = Math.min(255, mono + 8);
        data[offset + 1] = Math.min(255, mono + 4);
        data[offset + 2] = Math.max(0, mono - 2);
      } else if (filter === 'moody') {
        const gray = (r + g + b) / 3;
        data[offset] = Math.max(0, Math.min(255, gray * .18 + r * .82 - 13));
        data[offset + 1] = Math.max(0, Math.min(255, gray * .2 + g * .8 - 11));
        data[offset + 2] = Math.max(0, Math.min(255, gray * .23 + b * .77 - 7));
      } else if (filter === 'teal-orange') {
        data[offset] = Math.min(255, r * 1.08 + 13);
        data[offset + 1] = Math.max(0, Math.min(255, g * .98 + 5));
        data[offset + 2] = Math.max(0, Math.min(255, b * 1.08 + (r < 125 ? 13 : -4)));
      }
    }
    photoContext.putImageData(image, 0, 0);

    if (filter === 'halftone') {
      const dots = document.createElement('canvas');
      dots.width = photo.width;
      dots.height = photo.height;
      const dotContext = dots.getContext('2d');
      dotContext.fillStyle = '#f1e4c7';
      dotContext.fillRect(0, 0, dots.width, dots.height);
      dotContext.fillStyle = '#273b3a';
      const spacing = 6;
      for (let y = spacing / 2; y < dots.height; y += spacing) {
        for (let x = spacing / 2; x < dots.width; x += spacing) {
          const value = luminance[Math.min(dots.height - 1, Math.floor(y)) * dots.width + Math.min(dots.width - 1, Math.floor(x))] || 0;
          const radius = (1 - value / 255) * spacing * .44;
          if (radius > .35) {
            dotContext.beginPath();
            dotContext.arc(x, y, radius, 0, Math.PI * 2);
            dotContext.fill();
          }
        }
      }
      const result = document.createElement('canvas');
      result.width = photo.width;
      result.height = photo.height;
      const resultContext = result.getContext('2d');
      resultContext.drawImage(photo, 0, 0);
      resultContext.globalAlpha = .84;
      resultContext.drawImage(dots, 0, 0);
      return result;
    }

    if (filter === 'toon') {
      const edges = photoContext.getImageData(0, 0, photo.width, photo.height);
      const edgeData = edges.data;
      for (let y = 1; y < photo.height - 1; y += 1) {
        for (let x = 1; x < photo.width - 1; x += 1) {
          const p = y * photo.width + x;
          const gx = Math.abs(luminance[p + 1] - luminance[p - 1]);
          const gy = Math.abs(luminance[p + photo.width] - luminance[p - photo.width]);
          if (gx + gy > 62) {
            const i = p * 4;
            edgeData[i] *= .2;
            edgeData[i + 1] *= .2;
            edgeData[i + 2] *= .2;
          }
        }
      }
      photoContext.putImageData(edges, 0, 0);
    }
    return photo;
  }

  function drawFilteredCover(ctx, source, x, y, width, height, index, qualityScale = 1) {
    const prepared = preparePhoto(source, width * qualityScale, height * qualityScale, index, activeFilter);
    ctx.drawImage(prepared, x, y, width, height);
  }

  function createFrameOverlay(number) {
    const overlay = document.createElement('canvas');
    overlay.width = 426;
    overlay.height = 1280;
    const overlayContext = overlay.getContext('2d');
    overlayContext.drawImage(templates[number], 0, 0, overlay.width, overlay.height);
    overlayContext.globalCompositeOperation = 'destination-out';
    for (let index = 0; index < 3; index += 1) {
      clipWindow(overlayContext, number, index);
      overlayContext.fill();
    }
    overlayContext.globalCompositeOperation = 'source-over';
    return overlay;
  }

  function drawLiveCanvas() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#102629';
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < 3; index += 1) {
      const { x, y, w, h } = clipWindow(context, selectedTemplate, index);
      const source = shots[index] || (stream && video.readyState >= 2 ? video : null);
      context.save();
      context.clip();
      if (source) {
        drawFilteredCover(context, source, x, y, w, h, index);
      } else {
        context.fillStyle = index === activeSlot ? '#28413d' : '#1d3434';
        context.fillRect(x, y, w, h);
        context.fillStyle = '#e6d5b7';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = '600 16px Manrope, Arial';
        context.fillText(`FOTO ${index + 1}`, x + w / 2, y + h / 2 - 8);
        context.fillStyle = '#bfd0c5';
        context.font = '12px Arial';
        context.fillText(shots[index] ? 'TERISI' : 'KOTAK FOTO', x + w / 2, y + h / 2 + 15);
      }
      context.restore();
    }
    const frame = frameOverlays[selectedTemplate];
    if (frame) context.drawImage(frame, 0, 0, canvas.width, canvas.height);
    if (stream) scheduleRender();
  }

  function updateSlots() {
    document.querySelectorAll('[data-photo-slot]').forEach((button) => {
      const index = Number(button.dataset.photoSlot);
      const filled = Boolean(shots[index]);
      button.classList.toggle('is-filled', filled);
      button.classList.toggle('is-current', index === activeSlot);
      button.querySelector('span').textContent = filled ? 'Terisi · ulangi' : 'Kosong';
    });
    const replacing = Boolean(shots[activeSlot]);
    $('#shutterLabel').textContent = `${replacing ? 'Ulangi foto' : 'Ambil foto'} ${activeSlot + 1}`;
    $('#captureHint').textContent = replacing
      ? `Kotak ${activeSlot + 1} sudah terisi. Ambil ulang untuk mengganti fotonya.`
      : `Foto berikutnya akan masuk ke kotak ${activeSlot + 1} dari 3.`;
    $('#captureTitle').textContent = `${shots.filter(Boolean).length} dari 3 foto tersimpan`;
    $('#takePhoto').disabled = !stream || capturing;
    scheduleRender();
  }

  function composeOutput() {
    if (!shots.every(Boolean)) return;
    const frame = frameOverlays[selectedTemplate];
    if (!frame) return;
    const result = document.createElement('canvas');
    const outputDimensions = activeOutputSize === 'mobile'
      ? { width: 600, height: 1800 }
      : { width: 852, height: 2560 };
    const outputScaleX = outputDimensions.width / 426;
    const outputScaleY = outputDimensions.height / 1280;
    const qualityScale = Math.max(outputScaleX, outputScaleY);
    result.width = outputDimensions.width;
    result.height = outputDimensions.height;
    const resultContext = result.getContext('2d');
    resultContext.scale(outputScaleX, outputScaleY);
    resultContext.fillStyle = '#102629';
    resultContext.fillRect(0, 0, 426, 1280);
    shots.forEach((still, index) => {
      const { x, y, w, h } = clipWindow(resultContext, selectedTemplate, index);
      resultContext.save();
      resultContext.clip();
      drawFilteredCover(resultContext, still, x, y, w, h, index, qualityScale);
      resultContext.restore();
    });
    resultContext.drawImage(frame, 0, 0, 426, 1280);
    outputCanvas = result;
    $('#photoOutput').src = result.toDataURL('image/png');
    $('#photoOutputSection').hidden = false;
  }

  async function activateCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      updateStatus('KAMERA TIDAK DIDUKUNG', false);
      $('#photoPlaceholder').querySelector('small').textContent = 'Buka halaman melalui HTTPS atau localhost pada browser modern.';
      return;
    }
    try {
      stream?.getTracks().forEach((track) => track.stop());
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      video.srcObject = stream;
      await video.play();
      $('#photoPlaceholder').hidden = true;
      $('#takePhoto').disabled = false;
      updateStatus('KAMERA SIAP · LIVE');
      scheduleRender();
    } catch (error) {
      stream = null;
      updateStatus('KAMERA TIDAK TERSEDIA', false);
      $('#photoPlaceholder').hidden = false;
      $('#photoPlaceholder').querySelector('small').textContent = error.name === 'NotAllowedError'
        ? 'Izin kamera belum diberikan. Izinkan kamera melalui pengaturan browser.'
        : 'Kamera tidak dapat dibuka. Pastikan kamera tidak sedang digunakan aplikasi lain.';
    }
  }

  async function capturePhoto() {
    if (!stream || capturing || !video.videoWidth) return;
    capturing = true;
    $('#takePhoto').disabled = true;
    const counter = $('#boothCountdown');
    counter.hidden = false;
    updateStatus(`BERSIAP · FOTO ${activeSlot + 1} / 3`);
    try {
      for (let count = 3; count > 0; count -= 1) {
        counter.textContent = String(count);
        counter.classList.remove('is-pop');
        void counter.offsetWidth;
        counter.classList.add('is-pop');
        await wait(650);
      }
      const still = document.createElement('canvas');
      still.width = video.videoWidth;
      still.height = video.videoHeight;
      still.getContext('2d').drawImage(video, 0, 0, still.width, still.height);
      shots[activeSlot] = still;
      const flash = $('#boothFlash');
      flash.classList.remove('is-flashing');
      void flash.offsetWidth;
      flash.classList.add('is-flashing');
      const nextEmpty = shots.findIndex((shot) => !shot);
      activeSlot = nextEmpty >= 0 ? nextEmpty : 2;
      updateSlots();
      if (shots.every(Boolean)) {
        composeOutput();
        $('#photoOutputSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        updateStatus('3 FOTO SIAP · PREVIEW TERSEDIA');
      } else {
        updateStatus(`FOTO ${shots.filter(Boolean).length} / 3 TERSIMPAN`);
      }
    } catch (error) {
      console.warn('Pengambilan foto gagal:', error);
      updateStatus('PENGAMBILAN FOTO GAGAL');
    } finally {
      counter.hidden = true;
      capturing = false;
      $('#takePhoto').disabled = !stream;
    }
  }

  function setTemplate(number) {
    selectedTemplate = Number(number);
    document.querySelectorAll('[data-template]').forEach((button) => {
      const selected = Number(button.dataset.template) === selectedTemplate;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $('#templateChoiceLabel').textContent = selectedTemplate === 1 ? '01 · VOLCANO' : '02 · OCEAN';
    scheduleRender();
    composeOutput();
  }

  function setFilter(filter) {
    activeFilter = filter;
    ['#photoFilter', '#outputPhotoFilter'].forEach((selector) => {
      const select = $(selector);
      if (select) select.value = filter;
    });
    scheduleRender();
    composeOutput();
  }

  function resetSession() {
    shots.fill(null);
    activeSlot = 0;
    outputCanvas = null;
    $('#photoOutputSection').hidden = true;
    $('#photoOutput').removeAttribute('src');
    updateSlots();
    $('#photoStudio').scrollIntoView({ behavior: 'smooth', block: 'start' });
    updateStatus(stream ? 'KAMERA SIAP · LIVE' : 'KAMERA BELUM AKTIF');
  }

  document.querySelectorAll('[data-template]').forEach((button) => button.addEventListener('click', () => setTemplate(button.dataset.template)));
  ['#photoFilter', '#outputPhotoFilter'].forEach((selector) => {
    const select = $(selector);
    if (select) select.addEventListener('change', () => setFilter(select.value));
  });
  $('#downloadSize').addEventListener('change', (event) => {
    activeOutputSize = event.target.value;
    composeOutput();
  });
  document.querySelectorAll('[data-photo-slot]').forEach((button) => button.addEventListener('click', () => {
    activeSlot = Number(button.dataset.photoSlot);
    updateSlots();
  }));
  $('#activatePhotoCamera').addEventListener('click', activateCamera);
  $('#takePhoto').addEventListener('click', capturePhoto);
  $('#retakePhoto').addEventListener('click', resetSession);
  $('#savePhoto').addEventListener('click', () => {
    if (!outputCanvas) return;
    outputCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vulcaneos-photobooth-${outputCanvas.width}x${outputCanvas.height}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    }, 'image/png');
  });
  window.addEventListener('pagehide', () => stream?.getTracks().forEach((track) => track.stop()));

  updateSlots();
})();
