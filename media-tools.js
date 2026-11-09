/* =========================================================
   일잡코리아 - 사진·영상 자동 편집 도구 (관리자 페이지용)
   모두 휴대폰/PC 브라우저 안에서 처리합니다. (서버·추가 비용 없음)
     - resizeImage   : 사진 크기 줄이기 + 회전 바로잡기 + 위치정보(GPS) 등 메타데이터 제거
     - blurRegions   : 지정한 영역(얼굴 등) 모자이크
     - processVideo  : 짧은 영상 자동 편집 (구간 자르기·용량 줄이기·원본 소리 제거·배경 음악·로고/전화번호·대표 사진)
     - photosToVideo : 사진 여러 장 → 홍보 영상 (시작 화면 · 사진 슬라이드 · 끝 화면 · 배경 음악)
     - musicBuffer / previewMusic : 저작권 걱정 없는 배경 음악을 브라우저에서 직접 작곡
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
  function recorderMime(withAudio) {
    if (!window.MediaRecorder) return null;
    const list = withAudio
      ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
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

  // music: musicTrack() 결과 (없으면 소리 없는 영상)
  function record(canvas, fps, bitrate, music) {
    const mime = recorderMime(!!music) || recorderMime();
    const stream = canvas.captureStream(fps);
    if (music) stream.addTrack(music.track);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 128000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); if (music) music.close(); r(new Blob(chunks, { type: mime.split(';')[0] })); }; });
    if (music) music.start();
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
  // opts: { start, duration(최대 30), maxSide(1280), bitrate, music('bright'|'warm'|'power'|'piano'|'none'|File), onProgress(0~1) }
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

    const mus = await musicTrack(await musicBuffer(opts.music, dur));
    const r = record(c, 30, opts.bitrate || (Math.max(W, H) >= 1200 ? 2500000 : 1800000), mus);
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
  // items: [{ file|bitmap, label }]  opts: { orientation:'portrait'|'landscape', perPhoto:3, title, subtitle, music, onProgress }
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
    const mus = await musicTrack(await musicBuffer(opts.music, total));
    const r = record(c, 30, 2200000, mus);
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

  /* ---------- 배경 음악 ----------
     브라우저 안에서 직접 작곡해서 만드는 음악이라 저작권 걱정이 없습니다.
     opt: 'bright' | 'warm' | 'power' | 'piano' | 'none' | File(직접 고른 음악 파일) */
  const MUSIC_STYLES = {
    bright: { name: '밝고 경쾌하게', bpm: 112, key: 60, prog: ['I', 'V', 'vi', 'IV'], drums: 'pop', bass: 'bounce', arp: [0, 1, 2, 1, 3, 2, 1, 2], arpVol: 0.13, padVol: 0.05 },
    warm:   { name: '따뜻하고 잔잔하게', bpm: 78, key: 65, prog: ['I', 'iii', 'IV', 'V'], drums: 'shaker', bass: 'long', arp: [0, 2, 1, 2], arpVol: 0.12, padVol: 0.06 },
    power:  { name: '힘차게 (현장 작업)', bpm: 124, key: 57, prog: ['vi', 'IV', 'I', 'V'], drums: 'drive', bass: 'pulse', arp: [0, 2, 3, 2, 0, 2, 3, 1], arpVol: 0.1, padVol: 0.06 },
    piano:  { name: '피아노처럼 차분하게', bpm: 70, key: 62, prog: ['I', 'vi', 'IV', 'V'], drums: null, bass: 'long', arp: [0, 1, 2, 3, 2, 1], arpVol: 0.16, padVol: 0.035 }
  };
  const CHORDS = { I: [0, 4, 7], ii: [2, 5, 9], iii: [4, 7, 11], IV: [5, 9, 12], V: [7, 11, 14], vi: [9, 12, 16] };
  const CAT_MUSIC = { care: 'warm', repair: 'bright', construction: 'power', cleaning: 'bright', waste: 'power', farm: 'warm' };
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  function composeInto(oc, out, st, seconds) {
    const beat = 60 / st.bpm, bar = beat * 4;
    const noise = oc.createBuffer(1, oc.sampleRate, oc.sampleRate);
    const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
    function tone(type, f, t, a, peak, d, dest = out, detune = 0) {
      const o = oc.createOscillator(), g = oc.createGain();
      o.type = type; o.frequency.value = f; o.detune.value = detune;
      env(g, t, a, peak, d); o.connect(g).connect(dest); o.start(t); o.stop(t + a + d + 0.05);
    }
    // 부드러운 배경 화음
    const padBus = oc.createBiquadFilter(); padBus.type = 'lowpass'; padBus.frequency.value = 1400; padBus.connect(out);
    function pad(t, len, notes) {
      notes.forEach(n => [-7, 7].forEach(dt => {
        const o = oc.createOscillator(), g = oc.createGain();
        o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = dt;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(st.padVol, t + Math.min(0.6, len * 0.3));
        g.gain.setValueAtTime(st.padVol, t + len - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + len + 0.25);
        o.connect(g).connect(padBus); o.start(t); o.stop(t + len + 0.3);
      }));
    }
    // 피아노·기타 같은 짧은 소리
    function pluck(t, n, vol) {
      tone('triangle', hz(n), t, 0.005, vol, st.bpm < 90 ? 1.2 : 0.45);
      tone('sine', hz(n + 12), t, 0.005, vol * 0.35, 0.3);
    }
    function bass(t, n, len, vol = 0.32) { tone('sine', hz(n), t, 0.01, vol, len); tone('triangle', hz(n), t, 0.01, vol * 0.25, len * 0.6); }
    function kick(t, vol = 0.8) {
      const o = oc.createOscillator(), g = oc.createGain();
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      env(g, t, 0.002, vol, 0.28); o.connect(g).connect(out); o.start(t); o.stop(t + 0.35);
    }
    function noiseHit(t, type, freq, vol, d) {
      const s = oc.createBufferSource(), f = oc.createBiquadFilter(), g = oc.createGain();
      s.buffer = noise; f.type = type; f.frequency.value = freq;
      env(g, t, 0.002, vol, d); s.connect(f).connect(g).connect(out);
      s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05);
    }
    const hat = (t, v = 0.06) => noiseHit(t, 'highpass', 7500, v, 0.05);
    const clap = (t, v = 0.22) => noiseHit(t, 'bandpass', 1600, v, 0.16);
    const shaker = (t, v = 0.045) => noiseHit(t, 'highpass', 5000, v, 0.09);

    const bars = Math.ceil(seconds / bar) + 1;
    for (let b = 0; b < bars; b++) {
      const t0 = b * bar;
      const ch = CHORDS[st.prog[b % st.prog.length]].map(x => x + st.key);
      const intro = b === 0;                       // 첫 마디는 가볍게 시작
      pad(t0, bar, ch);
      // 베이스
      const root = ch[0] - (ch[0] - st.key > 7 ? 24 : 12);   // 한 옥타브(또는 두 옥타브) 아래
      if (st.bass === 'long') { bass(t0, root, bar * 0.9); }
      else if (st.bass === 'bounce') { [0, 1.5, 2, 3.5].forEach(x => bass(t0 + x * beat, root, beat * 0.9)); }
      else { for (let i = 0; i < 8; i++) bass(t0 + i * beat / 2, root, beat * 0.4, 0.26); }
      // 분산 화음 (멜로디 역할)
      const tones = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24];
      const step = bar / st.arp.length;
      st.arp.forEach((k, i) => { if (!(intro && i % 2)) pluck(t0 + i * step, tones[k], st.arpVol * (i === 0 ? 1.15 : 1)); });
      // 리듬
      if (!intro && st.drums === 'pop') {
        [0, 2].forEach(x => kick(t0 + x * beat, 0.7)); [1, 3].forEach(x => clap(t0 + x * beat));
        for (let i = 0; i < 8; i++) hat(t0 + i * beat / 2, i % 2 ? 0.04 : 0.06);
      } else if (!intro && st.drums === 'drive') {
        for (let i = 0; i < 4; i++) kick(t0 + i * beat, 0.8);
        [1, 3].forEach(x => clap(t0 + x * beat, 0.25));
        for (let i = 0; i < 8; i++) hat(t0 + i * beat / 2 + beat / 4, 0.06);
      } else if (st.drums === 'shaker') {
        for (let i = 0; i < 8; i++) shaker(t0 + i * beat / 2, i % 2 ? 0.03 : 0.045);
      }
    }
  }

  // 원하는 길이의 음악(AudioBuffer)을 만들고 앞뒤를 자연스럽게 줄임
  async function musicBuffer(opt, seconds) {
    if (!opt || opt === 'none') return null;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return null;
    const SR = 44100, len = Math.ceil(seconds * SR);
    const oc = new OAC(2, len, SR);
    const master = oc.createGain();
    const comp = oc.createDynamicsCompressor();
    master.connect(comp).connect(oc.destination);
    const fadeOut = Math.min(2, seconds * 0.2);
    master.gain.setValueAtTime(0.0001, 0);
    master.gain.linearRampToValueAtTime(0.9, 0.4);
    master.gain.setValueAtTime(0.9, Math.max(0.5, seconds - fadeOut));
    master.gain.linearRampToValueAtTime(0.0001, seconds);
    if (opt instanceof Blob) {                     // 직접 고른 음악 파일: 길이에 맞게 반복·자르기
      const AC = window.AudioContext || window.webkitAudioContext;
      const tmp = new AC();
      let buf;
      try { buf = await tmp.decodeAudioData(await opt.arrayBuffer()); }
      catch (_) { throw new Error('음악 파일을 읽을 수 없습니다. mp3 또는 m4a 파일을 골라 주세요.'); }
      finally { tmp.close && tmp.close(); }
      const s = oc.createBufferSource(); s.buffer = buf; s.loop = true;
      const g = oc.createGain(); g.gain.value = 0.8;
      s.connect(g).connect(master); s.start(0);
    } else {
      const st = MUSIC_STYLES[opt] || MUSIC_STYLES.bright;
      composeInto(oc, master, st, seconds);
    }
    return await oc.startRendering();
  }

  // 만든 음악을 녹화에 넣을 수 있는 소리 트랙으로 바꿈
  async function musicTrack(buffer) {
    if (!buffer) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    try { await ac.resume(); } catch (_) {}
    const dest = ac.createMediaStreamDestination();
    const src = ac.createBufferSource(); src.buffer = buffer; src.connect(dest);
    let started = false;
    return {
      track: dest.stream.getAudioTracks()[0],
      start() { if (!started) { started = true; src.start(); } },
      close() { try { src.stop(); } catch (_) {} try { ac.close(); } catch (_) {} }
    };
  }

  // 미리 듣기 (스피커로 재생). 반환값.stop() 으로 멈춤
  async function previewMusic(opt, seconds = 12) {
    const buf = await musicBuffer(opt, seconds);
    if (!buf) return { stop() {} };
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC(); try { await ac.resume(); } catch (_) {}
    const src = ac.createBufferSource(); src.buffer = buf; src.connect(ac.destination); src.start();
    let done = false;
    const stop = () => { if (done) return; done = true; try { src.stop(); } catch (_) {} try { ac.close(); } catch (_) {} };
    src.onended = stop;
    return { stop, ended: new Promise(r => { const o = src.onended; src.onended = () => { o(); r(); }; }) };
  }
  const musicFor = (opt, category) => opt === 'auto' ? (CAT_MUSIC[category] || 'bright') : opt;

  window.MediaTools = { resizeImage, blurRegions, thumbFromCanvas, processVideo, photosToVideo, videoInfo, supported, recorderMime, decodeImage, BRAND,
    musicBuffer, previewMusic, musicFor, MUSIC_STYLES };
})();
