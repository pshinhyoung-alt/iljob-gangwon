/* =========================================================
   일잡코리아 - 사진·영상 자동 편집 도구 (관리자 페이지용)
   모두 휴대폰/PC 브라우저 안에서 처리합니다. (서버·추가 비용 없음)
     - resizeImage   : 사진 크기 줄이기 + 회전 바로잡기 + 위치정보(GPS) 등 메타데이터 제거
     - blurRegions   : 지정한 영역(얼굴 등) 모자이크
     - processVideo  : 짧은 영상 자동 편집 (구간 자르기·용량 줄이기·소리 제거·로고/전화번호·대표 사진)
     - photosToVideo : 사진 여러 장 → 홍보 영상 (시작 화면 · 사진 슬라이드 · 끝 화면)
   ========================================================= */
(function () {
  const BRAND = { name: '일잡코리아 강원본부', short: '일잡코리아', phone: '033-731-5282', slogan: '필요한 일손, 당일 매칭' };
  const NAVY = '#0a1330', BLUE = '#2f6bff', AMBER = '#ffb020';
  const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

  const even = n => Math.max(2, Math.round(n / 2) * 2);
  const toBlob = (canvas, type = 'image/jpeg', q = 0.85) => new Promise(r => canvas.toBlob(r, type, q));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function loadFonts() {
    try { await Promise.all([document.fonts.load('800 40px Pretendard'), document.fonts.load('600 20px Pretendard')]); } catch (_) {}
  }

  async function decodeImage(src) {
    if (src instanceof ImageBitmap) return src;
    try { return await createImageBitmap(src, { imageOrientation: 'from-image' }); }
    catch (_) {
      const url = URL.createObjectURL(src);
      const img = new Image(); img.src = url; await img.decode(); URL.revokeObjectURL(url);
      return img;
    }
  }

  /* ---------- 사진 ---------- */
  async function resizeImage(file, maxSide = 1600, quality = 0.84, blurs = []) {
    const img = await decodeImage(file);
    const w0 = img.width, h0 = img.height;
    const s = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.round(w0 * s), h = Math.round(h0 * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    if (blurs && blurs.length) blurRegions(ctx, blurs, w, h);
    return { blob: await toBlob(c, 'image/jpeg', quality), width: w, height: h, canvas: c };
  }

  // blurs: [{x,y,w,h}] (0~1 비율) → 굵은 모자이크
  function blurRegions(ctx, blurs, W, H) {
    blurs.forEach(b => {
      const x = Math.max(0, Math.round(b.x * W)), y = Math.max(0, Math.round(b.y * H));
      const w = Math.min(W - x, Math.round(b.w * W)), h = Math.min(H - y, Math.round(b.h * H));
      if (w < 2 || h < 2) return;
      const cell = Math.max(8, Math.round(Math.max(w, h) / 9));
      const tmp = document.createElement('canvas');
      tmp.width = Math.max(1, Math.round(w / cell)); tmp.height = Math.max(1, Math.round(h / cell));
      const t = tmp.getContext('2d');
      t.drawImage(ctx.canvas, x, y, w, h, 0, 0, tmp.width, tmp.height);
      ctx.save(); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, h);
      ctx.restore();
    });
  }

  async function thumbFromCanvas(canvas, maxSide = 640) {
    const s = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
    const c = document.createElement('canvas'); c.width = Math.round(canvas.width * s); c.height = Math.round(canvas.height * s);
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
    return toBlob(c, 'image/jpeg', 0.8);
  }

  /* ---------- 녹화 형식 ---------- */
  function recorderMime() {
    if (!window.MediaRecorder) return null;
    const list = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    return list.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (_) { return false; } }) || null;
  }
  function supported() { return !!(recorderMime() && HTMLCanvasElement.prototype.captureStream); }

  function watermark(ctx, W, H) {
    const s = Math.min(W, H) / 720;
    const pad = 14 * s, fs = Math.round(22 * s);
    ctx.save();
    ctx.font = `700 ${fs}px ${FONT}`;
    const text = `${BRAND.short} · ${BRAND.phone}`;
    const tw = ctx.measureText(text).width;
    const bw = tw + pad * 2 + 30 * s, bh = fs + pad * 1.4;
    const x = W - bw - 18 * s, y = H - bh - 18 * s;
    ctx.fillStyle = 'rgba(10,19,48,.72)';
    roundRect(ctx, x, y, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = AMBER; ctx.beginPath(); ctx.arc(x + pad + 8 * s, y + bh / 2, 7 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + pad + 22 * s, y + bh / 2 + 1);
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function record(canvas, fps, bitrate) {
    const mime = recorderMime();
    const stream = canvas.captureStream(fps);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); r(new Blob(chunks, { type: mime.split(';')[0] })); }; });
    rec.start(500);
    return { stop: () => rec.state !== 'inactive' && rec.stop(), done, mime: mime.split(';')[0] };
  }

  /* ---------- 영상 정보 ---------- */
  async function videoInfo(file) {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'metadata';
    v.src = URL.createObjectURL(file);
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('영상을 읽을 수 없습니다')); });
    const info = { duration: v.duration, width: v.videoWidth, height: v.videoHeight, url: v.src };
    return info;
  }

  /* ---------- 짧은 영상 자동 편집 ---------- */
  // opts: { start, duration(최대 30), maxSide(1280), bitrate, onProgress(0~1) }
  async function processVideo(file, opts = {}) {
    if (!supported()) throw new Error('이 브라우저는 영상 편집을 지원하지 않습니다. 크롬 또는 최신 사파리를 사용해 주세요.');
    await loadFonts();
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    v.src = file instanceof Blob ? URL.createObjectURL(file) : file;
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('영상을 읽을 수 없습니다')); });
    const total = v.duration;
    const start = Math.max(0, Math.min(opts.start || 0, Math.max(0, total - 1)));
    const dur = Math.min(opts.duration || 30, 30, total - start);
    const maxSide = opts.maxSide || 1280;
    const s = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
    const W = even(v.videoWidth * s), H = even(v.videoHeight * s);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    v.currentTime = start;
    await new Promise(r => { v.onseeked = r; });
    const draw = () => { ctx.drawImage(v, 0, 0, W, H); watermark(ctx, W, H); };
    draw();
    const thumb = await thumbFromCanvas(c);

    const r = record(c, 30, opts.bitrate || (Math.max(W, H) >= 1200 ? 2500000 : 1800000));
    const end = start + dur;
    let stopped = false;
    const finish = () => { if (stopped) return; stopped = true; v.pause(); setTimeout(r.stop, 120); };
    const tick = () => {
      if (stopped) return;
      draw();
      if (opts.onProgress) opts.onProgress(Math.min(1, (v.currentTime - start) / dur));
      if (v.currentTime >= end || v.ended) { finish(); return; }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick); else requestAnimationFrame(tick);
    };
    v.onended = finish;
    await v.play();
    tick();
    // 안전장치: 재생이 멈춰도 (길이 + 5초) 뒤에는 종료
    const guard = setTimeout(finish, (dur + 5) * 1000);
    const blob = await r.done; clearTimeout(guard);
    if (opts.onProgress) opts.onProgress(1);
    if (file instanceof Blob) URL.revokeObjectURL(v.src);
    return { blob, mime: r.mime, thumb, width: W, height: H, duration: dur };
  }

  /* ---------- 사진 → 홍보 영상 ---------- */
  // items: [{ file|bitmap, label }]  opts: { orientation:'portrait'|'landscape', perPhoto:3, title, subtitle, onProgress }
  async function photosToVideo(items, opts = {}) {
    if (!supported()) throw new Error('이 브라우저는 영상 만들기를 지원하지 않습니다. 크롬 또는 최신 사파리를 사용해 주세요.');
    if (!items.length) throw new Error('사진을 1장 이상 선택해 주세요');
    await loadFonts();
    const portrait = opts.orientation !== 'landscape';
    const W = portrait ? 720 : 1280, H = portrait ? 1280 : 720;
    const per = opts.perPhoto || 3, fade = 0.6, intro = 2.6, outro = 3.2;
    const imgs = [];
    for (const it of items) imgs.push({ img: await decodeImage(it.bitmap || it.file), label: it.label || '' });
    const total = intro + imgs.length * per + outro;

    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const u = Math.min(W, H) / 720;

    function bg() {
      const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#1a3fb8'); g.addColorStop(0.55, NAVY); g.addColorStop(1, NAVY);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    function logo(cx, cy, size) {
      ctx.fillStyle = BLUE; roundRect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.26); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(size * 0.55)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('일', cx, cy + size * 0.03);
    }
    function center(text, y, size, color, weight = 800) {
      ctx.fillStyle = color; ctx.font = `${weight} ${Math.round(size)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, W / 2, y);
    }
    function drawIntro(a) {
      bg(); ctx.globalAlpha = a;
      logo(W / 2, H * 0.36, 110 * u);
      center(opts.title || BRAND.name, H * 0.36 + 120 * u, 54 * u, '#fff');
      center(opts.subtitle || '현장 작업 모습', H * 0.36 + 190 * u, 32 * u, AMBER, 700);
      ctx.globalAlpha = 1;
    }
    function drawOutro(a) {
      bg(); ctx.globalAlpha = a;
      logo(W / 2, H * 0.30, 96 * u);
      center(BRAND.name, H * 0.30 + 104 * u, 46 * u, '#fff');
      center(BRAND.slogan, H * 0.30 + 162 * u, 30 * u, 'rgba(255,255,255,.75)', 600);
      const bw = 470 * u, bh = 96 * u, bx = (W - bw) / 2, by = H * 0.30 + 230 * u;
      ctx.fillStyle = AMBER; roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
      center('☎ ' + BRAND.phone, by + bh / 2 + 2, 48 * u, NAVY, 900);
      center('원주 · 강원 전 지역', by + bh + 54 * u, 28 * u, 'rgba(255,255,255,.7)', 600);
      ctx.globalAlpha = 1;
    }
    function drawPhoto(p, t, a) {          // t: 0~1 진행, a: 투명도
      const img = p.img;
      const cover = Math.max(W / img.width, H / img.height);
      const z = cover * (1.04 + 0.10 * t);
      const dw = img.width * z, dh = img.height * z;
      const dx = (W - dw) / 2 + (W * 0.02) * (t - 0.5), dy = (H - dh) / 2;
      ctx.globalAlpha = a;
      ctx.drawImage(img, dx, dy, dw, dh);
      // 아래 그라데이션 + 설명
      const g = ctx.createLinearGradient(0, H * 0.62, 0, H); g.addColorStop(0, 'rgba(10,19,48,0)'); g.addColorStop(1, 'rgba(10,19,48,.85)');
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.62, W, H * 0.38);
      if (p.label) {
        ctx.font = `800 ${Math.round(40 * u)}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff';
        ctx.fillText(p.label, 40 * u, H - 120 * u);
      }
      ctx.globalAlpha = 1;
      watermark(ctx, W, H);
    }

    function frameAt(sec) {
      if (sec < intro) { drawIntro(Math.min(1, sec / 0.5)); return; }
      let x = sec - intro;
      const n = imgs.length;
      if (x < n * per) {
        const i = Math.floor(x / per), local = x - i * per;
        ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
        if (i === 0 && local < fade) { drawIntro(1); drawPhoto(imgs[0], local / per, local / fade); return; }
        if (local < fade && i > 0) {
          drawPhoto(imgs[i - 1], (per + local) / per, 1);
          drawPhoto(imgs[i], local / per, local / fade);
        } else drawPhoto(imgs[i], local / per, 1);
        return;
      }
      x -= n * per;
      if (x < fade) { drawPhoto(imgs[n - 1], 1 + x / per, 1); drawOutro(x / fade); return; }
      drawOutro(1);
    }

    frameAt(intro + per * 0.5);            // 목록용 대표 사진: 첫 번째 사진 장면
    const thumb = await thumbFromCanvas(c);
    frameAt(0);
    const r = record(c, 30, 2200000);
    const t0 = performance.now();
    await new Promise(resolve => {
      const loop = () => {
        const sec = (performance.now() - t0) / 1000;
        frameAt(Math.min(sec, total));
        if (opts.onProgress) opts.onProgress(Math.min(1, sec / total));
        if (sec >= total) { resolve(); return; }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await sleep(150); r.stop();
    const blob = await r.done;
    return { blob, mime: r.mime, thumb, width: W, height: H, duration: total };
  }

  window.MediaTools = { resizeImage, blurRegions, thumbFromCanvas, processVideo, photosToVideo, videoInfo, supported, recorderMime, decodeImage, BRAND };
})();
