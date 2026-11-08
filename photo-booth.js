(() => {
  const $ = (selector) => document.querySelector(selector);
  let result = { score: 0, samples: 0, quizCorrect: 0, quizTotal: 0 };
  let stream = null;
  let outputCanvas = null;
  try { result = { ...result, ...JSON.parse(localStorage.getItem('krakatau-last-patrol') || '{}') }; } catch { /* Fotobooth tetap dapat dibuka tanpa hasil tersimpan. */ }

  const badge = result.score >= 1500 ? 'Analis Pesisir' : result.score >= 800 ? 'Pengamat Pesisir' : 'Penjelajah Pesisir';
  $('#resultScore').textContent = String(result.score || 0);
  $('#resultSamples').textContent = String(result.samples || 0);
  $('#resultQuiz').textContent = `${result.quizCorrect || 0}/${result.quizTotal || 0}`;
  $('#resultBadge').textContent = badge;
  if (!result.date) $('#noRunMessage').hidden = false;

  function stopCamera() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    $('#photoVideo').srcObject = null;
  }

  async function activateCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      $('#photoCameraStatus').textContent = 'KAMERA TIDAK DIDUKUNG';
      return;
    }
    try {
      stopCamera();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      const video = $('#photoVideo');
      video.srcObject = stream;
      await video.play();
      video.hidden = false;
      $('#photoPlaceholder').hidden = true;
      $('#photoOutput').hidden = true;
      $('#photoViewfinder').classList.remove('has-photo');
      $('#photoCameraStatus').textContent = 'KAMERA SIAP';
      $('#takePhoto').disabled = false;
      $('#activatePhotoCamera').hidden = true;
      $('#retakePhoto').hidden = true;
    } catch (error) {
      $('#photoCameraStatus').textContent = 'KAMERA TIDAK TERSEDIA';
      $('#photoPlaceholder').querySelector('span').textContent = error.name === 'NotAllowedError' ? 'Izin kamera belum diberikan' : 'Kamera tidak dapat dibuka';
    }
  }

  function capture() {
    const video = $('#photoVideo');
    if (!video.videoWidth) return;
    const w = 1080, h = 1350, imageY = 150, imageH = 835;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = w; canvas.height = h;
    ctx.fillStyle = '#102b33'; ctx.fillRect(0, 0, w, h);
    const target = w / imageH, source = video.videoWidth / video.videoHeight;
    let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
    if (source > target) { sw = video.videoHeight * target; sx = (video.videoWidth - sw) / 2; }
    else { sh = video.videoWidth / target; sy = (video.videoHeight - sh) / 2; }
    ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(video, sx, sy, sw, sh, 0, imageY, w, imageH); ctx.restore();
    const fade = ctx.createLinearGradient(0, imageY + imageH - 180, 0, imageY + imageH + 20);
    fade.addColorStop(0, 'rgba(16,43,51,0)'); fade.addColorStop(1, '#102b33'); ctx.fillStyle = fade; ctx.fillRect(0, imageY + imageH - 180, w, 200);
    ctx.fillStyle = '#102b33'; ctx.fillRect(0, 0, w, imageY);
    ctx.strokeStyle = '#d5b47c'; ctx.lineWidth = 3; ctx.strokeRect(25, 25, w - 50, h - 50);
    ctx.fillStyle = '#d8b47b'; ctx.beginPath(); ctx.moveTo(54, 59); ctx.lineTo(78, 27); ctx.lineTo(97, 49); ctx.lineTo(111, 33); ctx.lineTo(141, 68); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f2f1e8'; ctx.font = '700 25px Manrope, Arial'; ctx.fillText('KRAKATAU WATCH', 158, 57);
    ctx.fillStyle = '#aec4b7'; ctx.font = '13px Arial'; ctx.fillText('COASTAL INTELLIGENCE', 158, 83);
    ctx.textAlign = 'right'; ctx.fillStyle = '#d9bd8b'; ctx.font = '700 14px Arial'; ctx.fillText('FIELD OBSERVER / 2026', w - 55, 61);
    ctx.textAlign = 'left'; ctx.fillStyle = '#a9beb1'; ctx.font = '700 14px Arial'; ctx.fillText('CATATAN PATROLI PESISIR', 58, 1030);
    const name = $('#photoName').value.trim() || 'Pengamat Pesisir';
    let size = 46; ctx.font = `700 ${size}px Manrope, Arial`;
    while (ctx.measureText(name).width > 650 && size > 26) { size -= 2; ctx.font = `700 ${size}px Manrope, Arial`; }
    ctx.fillStyle = '#f5f2e8'; ctx.fillText(name, 58, 1090);
    const nim = $('#photoNim').value.trim();
    ctx.fillStyle = '#b7cabe'; ctx.font = '19px Arial'; ctx.fillText(nim ? `NIM ${nim}` : 'ANAK KRAKATAU - SELAT SUNDA', 60, 1127);
    ctx.textAlign = 'right'; ctx.fillStyle = '#b7cabe'; ctx.font = '700 13px Arial'; ctx.fillText('SKOR PATROLI', w - 58, 1029);
    ctx.fillStyle = '#f5f2e8'; ctx.font = '700 66px Manrope, Arial'; ctx.fillText(String(result.score || 0), w - 58, 1090);
    ctx.fillStyle = '#d8b47b'; ctx.font = '700 17px Arial'; ctx.fillText(badge.toUpperCase(), w - 58, 1127);
    ctx.textAlign = 'left'; ctx.strokeStyle = '#ffffff30'; ctx.beginPath(); ctx.moveTo(58, 1164); ctx.lineTo(w - 58, 1164); ctx.stroke();
    ctx.fillStyle = '#a9beb1'; ctx.font = '14px Arial'; ctx.fillText(`${result.samples || 0} sampel  /  checkpoint ${result.quizCorrect || 0} benar dari ${result.quizTotal || 0}`, 60, 1200);
    ctx.textAlign = 'right'; ctx.font = '12px Arial'; ctx.fillText('OBSERVATION SERIES - SELAT SUNDA', w - 58, 1280);
    outputCanvas = canvas;
    $('#photoOutput').src = canvas.toDataURL('image/jpeg', .94);
    $('#photoOutput').hidden = false; $('#photoVideo').hidden = true;
    $('#photoViewfinder').classList.add('has-photo');
    $('#photoCameraStatus').textContent = 'FOTO SIAP';
    $('#takePhoto').hidden = true; $('#retakePhoto').hidden = false; $('#savePhoto').disabled = false;
    stopCamera();
  }

  function save() {
    if (!outputCanvas) return;
    outputCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'krakatau-watch-hasil-patroli.png'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
    }, 'image/png');
  }

  $('#activatePhotoCamera').addEventListener('click', activateCamera);
  $('#retakePhoto').addEventListener('click', activateCamera);
  $('#takePhoto').addEventListener('click', capture);
  $('#savePhoto').addEventListener('click', save);
  window.addEventListener('pagehide', stopCamera);
})();

