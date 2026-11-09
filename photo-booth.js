(() => {
  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#liveBoothCanvas');
  const context = canvas.getContext('2d');
  const video = $('#photoVideo');
  const templates = {};
  const frameOverlays = {};
  const originalFrameOverlays = {};
  const originalTemplates = {};
  const shots = [null, null, null];
  let selectedTemplate = 3;
  let selectedOutputLayout = 'camera';
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
      frameOverlays[number] = createFrameOverlay(number, 'camera');
      originalFrameOverlays[number] = createFrameOverlay(number, 'original');
      document.querySelectorAll(`[data-template-thumb="${number}"], .output-template[data-template="${number}"] img`).forEach((thumb) => { thumb.src = makeTemplateThumbnail(frameOverlays[number]); });
      scheduleRender();
    };
    templates[number] = image;
  });

  templates[3] = createPolaroidTemplate(true);
  originalTemplates[3] = createPolaroidTemplate(false);
  frameOverlays[3] = createFrameOverlay(3, 'camera');
  originalFrameOverlays[3] = createFrameOverlay(3, 'original');
  document.querySelectorAll('[data-template-thumb="3"], .output-template[data-template="3"] img').forEach((image) => { image.src = makeTemplateThumbnail(frameOverlays[3]); });

  function createPolaroidTemplate(includeCamera = true) {
    const art = document.createElement('canvas');
    art.width = 426; art.height = 1280;
    const ctx = art.getContext('2d');
    ctx.fillStyle = '#f1ede4'; ctx.fillRect(0, 0, art.width, art.height);
    for (let i = 0; i < 1500; i += 1) {
      ctx.fillStyle = `rgba(95,78,57,${Math.random() * .055})`;
      ctx.fillRect(Math.random() * 426, Math.random() * 1280, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }

    if (includeCamera) drawPrintCamera(ctx);
    else {
      ctx.fillStyle = '#a13f32'; ctx.beginPath(); ctx.arc(212, 78, 40, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f5e9d4'; ctx.beginPath(); ctx.arc(212, 78, 31, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4c5b4c'; ctx.font = '700 13px Arial'; ctx.textAlign = 'center'; ctx.fillText('FIELD PRINT / 03', 212, 82);
    }

    // Side clips sit behind the vertical three-frame film strip.
    function paperclip(x, y, angle) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.strokeStyle = '#a9aaa5'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-34, -53); ctx.quadraticCurveTo(-44, -70, -30, -77); ctx.quadraticCurveTo(-17, -82, -8, -66); ctx.lineTo(33, 12); ctx.quadraticCurveTo(42, 30, 27, 39); ctx.quadraticCurveTo(13, 46, 5, 30); ctx.lineTo(-25, -23); ctx.stroke();
      ctx.strokeStyle = '#e4e0d7'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }
    paperclip(39, 544, -.22); paperclip(387, 1087, .38);

    ctx.fillStyle = '#741d13'; ctx.fillRect(30, 198, 366, 958);
    ctx.fillStyle = '#541810'; ctx.fillRect(30, 198, 16, 958); ctx.fillRect(380, 198, 16, 958);
    ctx.fillStyle = '#171917'; ctx.fillRect(72, 195, 282, 22);
    const windows = [
      { x: 76, y: 293, w: 274, h: 188 },
      { x: 76, y: 557, w: 274, h: 188 },
      { x: 76, y: 821, w: 274, h: 188 },
    ];
    windows.forEach(({ x, y, w, h }, index) => {
      ctx.fillStyle = '#f7f2e9'; ctx.fillRect(x - 17, y - 16, w + 34, h + 32);
      ctx.fillStyle = '#7b2117';
      for (let cx = x - 13; cx <= x + w + 12; cx += 25) {
        ctx.beginPath(); ctx.arc(cx, y - 16, 11, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx, y + h + 16, 11, 0, Math.PI * 2); ctx.fill();
      }
      for (let cy = y + 10; cy < y + h; cy += 25) {
        ctx.beginPath(); ctx.arc(x - 17, cy, 11, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + w + 17, cy, 11, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#f7f2e9'; ctx.font = '700 10px Arial'; ctx.textAlign = 'center';
      ctx.fillText(`FRAME ${index + 1}`, 213, y + h + 35);
    });

    // Barcode and small printed caption at the foot of the strip.
    let bx = 82;
    const bars = [2, 4, 1, 3, 2, 1, 5, 2, 3, 1, 4, 2, 1, 3, 5, 1, 2, 4, 1, 3, 2, 5, 1, 2, 4, 1, 3, 2, 5, 1, 3, 2, 4, 1, 2, 3, 5, 1, 2, 4];
    ctx.fillStyle = '#f7f2e9';
    bars.forEach((bar, index) => { const width = bar * 1.25; if (index % 2 === 0) ctx.fillRect(bx, 1064, width, 37); bx += width + 1.4; });
    ctx.fillStyle = '#f1d8ab'; ctx.font = '700 11px Arial'; ctx.textAlign = 'center'; ctx.fillText('ANAK KRAKATAU · SELAT SUNDA', 213, 1138);
    ctx.fillStyle = '#d7bb8d'; ctx.beginPath(); ctx.roundRect(17, 1141, 77, 78, 3); ctx.fill();
    ctx.fillStyle = '#9f3d33'; ctx.beginPath(); ctx.arc(55, 1179, 21, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#edc56e'; ctx.font = '700 10px Arial'; ctx.fillText('VOLCANEOS', 55, 1212);
    return art;
  }

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

  function clipWindow(ctx, template, index, layout = 'camera') {
    ctx.beginPath();
    if (template === 3) {
      const windows = [
        { x: 76, y: 293, w: 274, h: 188 },
        { x: 76, y: 557, w: 274, h: 188 },
        { x: 76, y: 821, w: 274, h: 188 },
      ];
      const { x, y, w, h } = windows[index];
      ctx.rect(x, y, w, h);
      return { x, y, w, h };
    }
    const printScale = layout === 'camera' ? .82 : 1;
    const printOffsetX = (426 - 426 * printScale) / 2;
    const printOffsetY = layout === 'camera' ? 222 : 0;
    if (template === 1) {
      const windows = [
        { x: 42, y: 230, w: 341, h: 248 },
        { x: 42, y: 516, w: 341, h: 249 },
        { x: 42, y: 803, w: 341, h: 249 },
      ];
      const sourceWindow = windows[index];
      const x = printOffsetX + sourceWindow.x * printScale;
      const y = printOffsetY + sourceWindow.y * printScale;
      const w = sourceWindow.w * printScale;
      const h = sourceWindow.h * printScale;
      ctx.rect(x, y, w, h);
      return { x, y, w, h };
    }
    if (index === 0) {
      // Match the arched first window in photoboothtemp2 and extend slightly
      // beneath its printed edge so no checkerboard sliver survives scaling.
      ctx.moveTo(printOffsetX + 53 * printScale, printOffsetY + 286 * printScale);
      ctx.quadraticCurveTo(printOffsetX + 53 * printScale, printOffsetY + 129 * printScale, printOffsetX + 218 * printScale, printOffsetY + 129 * printScale);
      ctx.quadraticCurveTo(printOffsetX + 384 * printScale, printOffsetY + 129 * printScale, printOffsetX + 384 * printScale, printOffsetY + 286 * printScale);
      ctx.lineTo(printOffsetX + 384 * printScale, printOffsetY + 434 * printScale);
      ctx.lineTo(printOffsetX + 53 * printScale, printOffsetY + 434 * printScale);
      ctx.closePath();
      return { x: printOffsetX + 53 * printScale, y: printOffsetY + 129 * printScale, w: 331 * printScale, h: 305 * printScale };
    }
    if (index === 1) {
      // The second opening is square-cornered; add a 2 px bleed around it.
      ctx.rect(printOffsetX + 53 * printScale, printOffsetY + 442 * printScale, 331 * printScale, 263 * printScale);
      return { x: printOffsetX + 53 * printScale, y: printOffsetY + 442 * printScale, w: 331 * printScale, h: 263 * printScale };
    }
    // The last opening has square top corners and rounded bottom corners only.
    const left = printOffsetX + 53 * printScale;
    const right = printOffsetX + 384 * printScale;
    const top = printOffsetY + 716 * printScale;
    const bottom = printOffsetY + 1007 * printScale;
    const radius = 51 * printScale;
    ctx.moveTo(left, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right, bottom - radius);
    ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
    ctx.lineTo(left + radius, bottom);
    ctx.quadraticCurveTo(left, bottom, left, bottom - radius);
    ctx.closePath();
    return { x: left, y: top, w: right - left, h: bottom - top };
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

  function createFrameOverlay(number, layout = 'camera') {
    const overlay = document.createElement('canvas');
    overlay.width = 426;
    overlay.height = 1280;
    const overlayContext = overlay.getContext('2d');
    if (number < 3 && layout === 'camera') {
      const printScale = .82;
      const printOffsetX = (overlay.width - overlay.width * printScale) / 2;
      overlayContext.fillStyle = '#f1ede4'; overlayContext.fillRect(0, 0, overlay.width, overlay.height);
      overlayContext.drawImage(templates[number], 0, 0, overlay.width, overlay.height, printOffsetX, 222, overlay.width * printScale, overlay.height * printScale);
      drawPrintCamera(overlayContext);
    } else if (number < 3) {
      overlayContext.drawImage(templates[number], 0, 0, overlay.width, overlay.height);
    } else {
      const source = layout === 'original' ? originalTemplates[number] : templates[number];
      overlayContext.drawImage(source, 0, 0, overlay.width, overlay.height);
    }
    overlayContext.globalCompositeOperation = 'destination-out';
    for (let index = 0; index < 3; index += 1) {
      clipWindow(overlayContext, number, index, layout);
      overlayContext.fill();
    }
    overlayContext.globalCompositeOperation = 'source-over';
    return overlay;
  }

  function makeTemplateThumbnail(frame) {
    const thumb = document.createElement('canvas');
    thumb.width = 426; thumb.height = 1280;
    const thumbContext = thumb.getContext('2d');
    thumbContext.fillStyle = '#e7e7df'; thumbContext.fillRect(0, 0, thumb.width, thumb.height);
    thumbContext.drawImage(frame, 0, 0);
    return thumb.toDataURL('image/png');
  }

  function drawPrintCamera(ctx) {
    ctx.fillStyle = '#191b19'; ctx.beginPath(); ctx.roundRect(18, -42, 390, 276, 30); ctx.fill();
    ctx.fillStyle = '#f3e8d3'; ctx.beginPath(); ctx.roundRect(27, -37, 372, 257, 24); ctx.fill();
    ctx.fillStyle = '#252624'; ctx.fillRect(27, 169, 372, 49);
    ctx.fillStyle = '#171917'; ctx.beginPath(); ctx.roundRect(143, 15, 140, 130, 20); ctx.fill();
    ctx.fillStyle = '#66716c'; ctx.beginPath(); ctx.arc(213, 80, 47, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#202824'; ctx.beginPath(); ctx.arc(213, 80, 35, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d9e2d9'; ctx.beginPath(); ctx.arc(199, 65, 10, 0, Math.PI * 2); ctx.fill();
    for (const stripe of [{ x: 177, c: '#e34b34' }, { x: 198, c: '#f1b43e' }, { x: 219, c: '#57a9c1' }]) {
      ctx.fillStyle = stripe.c; ctx.fillRect(stripe.x, 0, 17, 54);
    }
    ctx.fillStyle = '#343531'; ctx.font = '700 13px Arial'; ctx.textAlign = 'center'; ctx.fillText('POLAROID CAMERA', 213, 164);
    ctx.fillStyle = '#171917'; ctx.fillRect(72, 195, 282, 22);
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
        // Keep empty preview windows in the same warm paper tone as the studio;
        // never render instructional labels into the image area.
        context.fillStyle = '#f1ede4';
        context.fillRect(x, y, w, h);
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
    // A printable/downloadable result only exists after all three real
    // captures are present. This prevents preview placeholders from leaking
    // into a PNG if a template or output option changes mid-session.
    if (!shots.every((shot) => shot instanceof HTMLCanvasElement && shot.width > 0 && shot.height > 0)) {
      outputCanvas = null;
      $('#photoOutput').removeAttribute('src');
      $('#photoOutputSection').hidden = true;
      return;
    }
    const frame = (selectedOutputLayout === 'original' ? originalFrameOverlays : frameOverlays)[selectedTemplate];
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
      const { x, y, w, h } = clipWindow(resultContext, selectedTemplate, index, selectedOutputLayout);
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
    $('#templateChoiceLabel').textContent = ({ 1: '01 · VOLCANO', 2: '02 · OCEAN', 3: '03 · POLAROID' })[selectedTemplate];
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
  document.querySelectorAll('[data-output-layout]').forEach((button) => button.addEventListener('click', () => {
    selectedOutputLayout = button.dataset.outputLayout;
    document.querySelectorAll('[data-output-layout]').forEach((option) => {
      const selected = option === button;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    });
    composeOutput();
  }));
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
