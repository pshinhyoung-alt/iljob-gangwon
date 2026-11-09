/* =========================================================
   관리자 - 현장 갤러리 올리기·관리
   admin.html 에서 로그인 후 window.ILJOB_ADMIN = { sb, toast } 로 시작됩니다.
   ========================================================= */
(function () {
  const CATS = { care: '돌봄·간병', repair: '생활 돌봄(집수리)', construction: '건설', cleaning: '입주·숙소 청소', waste: '폐기물 처리', farm: '농업' };
  const MODES = [
    ['photo', '📷 사진'], ['beforeafter', '↔ 작업 전·후'], ['video', '🎬 짧은 영상'], ['youtube', '▶ 유튜브 링크'], ['slideshow', '✨ 사진→홍보영상']
  ];
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  let sb, toast, cfg, mode = 'photo', items = [], listCat = '', busy = false;
  // 선택한 파일 상태
  let photos = [];            // [{file, blurs:[], url}]
  let baBefore = null, baAfter = null;
  let video = null;           // {file, url, duration}
  let slides = [];            // [{file, url}]
  let slideResult = null;     // {blob, mime, thumb}

  const fileUrl = p => p ? cfg.SUPABASE_URL.replace(/\/$/, '') + '/storage/v1/object/public/gallery/' + p.split('/').map(encodeURIComponent).join('/') : '';
  const thumbOf = it => it.kind === 'youtube' ? 'https://i.ytimg.com/vi/' + encodeURIComponent(it.youtube_id) + '/hqdefault.jpg' : fileUrl(it.thumb_path || it.media_path);
  function newPath(cat, ext) {
    const d = today().replace(/-/g, '').slice(0, 6);
    return `${cat}/${d}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  }
  async function upload(path, blob, type) {
    const { error } = await sb.storage.from('gallery').upload(path, blob, { contentType: type, cacheControl: '31536000', upsert: false });
    if (error) throw new Error('파일 올리기 실패: ' + error.message);
    return path;
  }
  function common() {
    return {
      category: $('gCat').value, taken_on: $('gDate').value || today(),
      location: $('gLoc').value.trim() || null, caption: $('gCap').value.trim() || null, published: $('gPub').checked
    };
  }
  function progress(p, text) {
    const box = $('gProg'); box.hidden = p == null;
    if (p != null) { $('gProgBar').style.width = Math.round(p * 100) + '%'; $('gProgTxt').textContent = text || ''; }
  }
  function setBusy(b) { busy = b; $('gSubmit').disabled = b; }

  /* ---------------- 화면 ---------------- */
  function mount() {
    const root = $('galView');
    root.innerHTML = `
      <div class="g-card">
        <h2>현장 사진·영상 올리기</h2>
        <p class="g-sub">올린 사진은 바로 <a href="gallery.html" target="_blank" rel="noopener">현장 갤러리</a>에 공개됩니다. <b>실제 현장 사진만</b> 올려 주세요.</p>
        <div class="g-modes" id="gModes">${MODES.map(([k, v]) => `<button type="button" data-m="${k}" class="${k === mode ? 'on' : ''}">${v}</button>`).join('')}</div>

        <div class="g-grid2">
          <label>분야<select class="field-in" id="gCat">${Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>작업 날짜<input class="field-in" type="date" id="gDate" value="${today()}" /></label>
          <label>지역 <small>(동까지만, 집 주소·호수는 쓰지 마세요)</small><input class="field-in" id="gLoc" maxlength="40" placeholder="예: 원주 단구동" /></label>
          <label>한 줄 설명<input class="field-in" id="gCap" maxlength="80" placeholder="예: 아파트 입주 청소 - 욕실·주방" /></label>
        </div>

        <!-- 사진 -->
        <div class="g-pane" data-p="photo">
          <label class="g-drop">📷 사진 선택 (여러 장 가능)<input type="file" id="gPhotos" accept="image/*" multiple hidden /></label>
          <div class="g-thumbs" id="gPhotoList"></div>
          <p class="g-tip">사람 얼굴·차량 번호판·집 호수가 보이면 사진 아래 <b>[얼굴 가리기]</b>로 가려 주세요. 사진의 위치정보(GPS)는 자동으로 지워집니다.</p>
        </div>
        <!-- 작업 전/후 -->
        <div class="g-pane" data-p="beforeafter" hidden>
          <div class="g-ba">
            <div><b>작업 전</b><label class="g-drop sm">사진 선택<input type="file" id="gBefore" accept="image/*" hidden /></label><div id="gBeforeBox"></div></div>
            <div><b>작업 후</b><label class="g-drop sm">사진 선택<input type="file" id="gAfter" accept="image/*" hidden /></label><div id="gAfterBox"></div></div>
          </div>
          <p class="g-tip">같은 위치·같은 방향에서 찍은 사진일수록 비교 효과가 좋습니다.</p>
        </div>
        <!-- 짧은 영상 -->
        <div class="g-pane" data-p="video" hidden>
          <label class="g-drop">🎬 영상 선택 (1분 이내 권장)<input type="file" id="gVideo" accept="video/*" hidden /></label>
          <div id="gVideoBox" hidden>
            <video id="gVideoPrev" muted playsinline controls></video>
            <div class="g-grid2">
              <label>시작 지점 <span id="gStartTxt">0초</span><input type="range" id="gStart" min="0" max="0" step="0.5" value="0" /></label>
              <label>길이<select class="field-in" id="gLen"><option value="10">10초</option><option value="15" selected>15초</option><option value="20">20초</option><option value="30">30초 (최대)</option></select></label>
            </div>
${musicPicker('V')}
            <p class="g-tip">자동으로 <b>길이 자르기 · 용량 줄이기 · 원본 소리 제거(대화·소음) · 배경 음악 넣기 · 로고와 전화번호 넣기 · 대표 사진</b>을 만듭니다. 편집하는 동안 <b>화면을 끄거나 다른 앱으로 나가지 마세요.</b></p>
          </div>
          <p class="g-tip" id="gVideoNo" hidden>⚠️ 이 브라우저는 영상 편집을 지원하지 않습니다. 크롬이나 최신 사파리로 열어 주세요.</p>
        </div>
        <!-- 유튜브 -->
        <div class="g-pane" data-p="youtube" hidden>
          <label>유튜브 주소<input class="field-in" id="gYt" placeholder="https://youtu.be/... 또는 https://www.youtube.com/shorts/..." /></label>
          <div id="gYtPrev"></div>
          <p class="g-tip">얼굴이 나오는 영상은 유튜브 스튜디오 → 편집기 → <b>흐리게 처리(얼굴 흐리게)</b>를 먼저 적용해 주세요. 공개 상태는 "공개" 또는 "일부 공개"여야 합니다.</p>
        </div>
        <!-- 사진 → 홍보영상 -->
        <div class="g-pane" data-p="slideshow" hidden>
          <label class="g-drop">✨ 사진 선택 (2~15장, 고른 순서대로)<input type="file" id="gSlides" accept="image/*" multiple hidden /></label>
          <div class="g-thumbs sm" id="gSlideList"></div>
          <div class="g-grid2">
            <label>영상 모양<select class="field-in" id="gOrient"><option value="portrait">세로 (쇼츠·릴스·카톡용)</option><option value="landscape">가로 (유튜브·홈페이지용)</option></select></label>
            <label>사진 한 장당<select class="field-in" id="gPer"><option value="2">2초</option><option value="3" selected>3초</option><option value="4">4초</option></select></label>
          </div>
${musicPicker('S')}
          <div id="gSlideOut" hidden>
            <p class="g-warn">⚠️ 아직 갤러리에 <b>올라가지 않았어요.</b> 확인 후 맨 아래 <b>[갤러리에 올리기]</b>를 눌러 주세요.</p>
            <video id="gSlidePrev" controls playsinline></video>
            <div class="g-row"><a class="btn btn-light" id="gSlideDown" download>📥 휴대폰에 저장 (인스타·블로그용)</a></div>
          </div>
          <p class="g-tip">시작 화면(상호) → 사진마다 천천히 확대 → 끝 화면(전화번호)으로 자동 구성되고, 배경 음악이 함께 들어갑니다. 만드는 동안 화면을 켜 두세요.</p>
        </div>

        <p class="g-tip">📁 <b>분야 · 작업 날짜 · 지역 · 한 줄 설명</b>이 같으면 갤러리에서 <b>한 현장 묶음</b>으로 보입니다. 같은 현장의 홍보영상·작업 전후도 똑같이 적어 주세요.</p>
        <label class="g-check"><input type="checkbox" id="gPub" checked /> 홈페이지 갤러리에 바로 공개</label>
        <div class="g-prog" id="gProg" hidden><div class="g-bar"><i id="gProgBar"></i></div><span id="gProgTxt"></span></div>
        <button class="btn btn-primary g-submit" id="gSubmit">올리기</button>
      </div>

      <div class="g-card">
        <div class="g-head">
          <h2>올린 사진·영상 <small id="gCount"></small></h2>
          <div class="g-head-r">
            <select class="field-in" id="gListCat"><option value="">전체 분야</option>${Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
            <a class="btn btn-light" href="gallery.html" target="_blank" rel="noopener">갤러리 보기</a>
          </div>
        </div>
        <div class="g-list" id="gList"></div>
      </div>

      <!-- 얼굴 가리기 편집 -->
      <div class="g-blur" id="gBlur" hidden>
        <div class="g-blur-in">
          <div class="g-blur-top"><b>가릴 곳을 손가락(마우스)으로 네모나게 그리세요</b></div>
          <div class="g-blur-stage"><canvas id="gBlurCv"></canvas></div>
          <div class="g-blur-bot">
            <button class="btn btn-light" id="gBlurUndo">되돌리기</button>
            <button class="btn btn-light" id="gBlurClear">모두 지우기</button>
            <span style="flex:1"></span>
            <button class="btn btn-light" id="gBlurCancel">취소</button>
            <button class="btn btn-primary" id="gBlurOk">완료</button>
          </div>
        </div>
      </div>`;
    bind();
    setMode(mode);
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('#gModes [data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    document.querySelectorAll('.g-pane').forEach(p => { p.hidden = p.dataset.p !== m; });
    $('gSubmit').textContent = m === 'slideshow' ? (slideResult ? '갤러리에 올리기' : '홍보영상 만들기') : m === 'video' ? '자동 편집 후 올리기' : '올리기';
    if (m === 'video' || m === 'slideshow') {
      const ok = window.MediaTools && MediaTools.supported();
      if (m === 'video') $('gVideoNo').hidden = ok;
      if (!ok && m === 'slideshow') toast('이 브라우저는 영상 만들기를 지원하지 않습니다. 크롬이나 최신 사파리를 사용해 주세요.');
    }
  }

  // 배경 음악 고르기 (짧은 영상 V / 홍보영상 S 공용)
  const musicFiles = { V: null, S: null };
  let musicPlay = null;
  const musicPicker = sfx => `
          <div class="g-music">
            <label>🎵 배경 음악<select class="field-in" id="gMusic${sfx}">
              <option value="auto" selected>자동 (분야에 맞게)</option>
              <option value="bright">밝고 경쾌하게</option>
              <option value="warm">따뜻하고 잔잔하게</option>
              <option value="power">힘차게 (현장 작업)</option>
              <option value="piano">피아노처럼 차분하게</option>
              <option value="none">음악 없음</option>
              <option value="file">내 음악 파일 고르기…</option>
            </select></label>
            <button type="button" class="btn btn-light g-mprev" data-s="${sfx}">▶ 미리 듣기</button>
            <input type="file" id="gMusicFile${sfx}" accept="audio/*" hidden />
            <p class="g-mfile" id="gMusicName${sfx}" hidden></p>
          </div>`;
  function musicOpt(sfx, category) {
    const v = $('gMusic' + sfx).value;
    if (v === 'file') { if (!musicFiles[sfx]) throw new Error('배경 음악 파일을 골라 주세요'); return musicFiles[sfx]; }
    return MediaTools.musicFor(v, category);
  }
  function stopMusicPreview() {
    if (musicPlay) { musicPlay.stop(); musicPlay = null; }
    document.querySelectorAll('.g-mprev').forEach(b => { b.textContent = '▶ 미리 듣기'; });
  }
  async function toggleMusicPreview(btn) {
    const sfx = btn.dataset.s;
    if (musicPlay) { const same = musicPlay.sfx === sfx; stopMusicPreview(); if (same) return; }
    let opt;
    try { opt = musicOpt(sfx, $('gCat').value); } catch (err) { toast(err.message); return; }
    if (opt === 'none') { toast('음악 없음으로 선택되어 있어요'); return; }
    btn.textContent = '…';
    try {
      const h = await MediaTools.previewMusic(opt, 12);
      musicPlay = { stop: h.stop, sfx }; btn.textContent = '■ 멈추기';
      if (h.ended) h.ended.then(() => { if (musicPlay && musicPlay.stop === h.stop) stopMusicPreview(); });
    } catch (err) { btn.textContent = '▶ 미리 듣기'; toast(err.message); }
  }
  function bindMusic(sfx, onChange) {
    $('gMusic' + sfx).addEventListener('change', e => {
      stopMusicPreview();
      if (e.target.value === 'file') $('gMusicFile' + sfx).click();
      else { $('gMusicName' + sfx).hidden = true; }
      if (onChange) onChange();
    });
    $('gMusicFile' + sfx).addEventListener('change', e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) { if (!musicFiles[sfx]) $('gMusic' + sfx).value = 'auto'; return; }
      musicFiles[sfx] = f;
      const n = $('gMusicName' + sfx);
      n.innerHTML = '🎵 ' + esc(f.name) + '<br><small>⚠️ 가요·유행곡처럼 저작권이 있는 음악은 쓰면 안 됩니다. 유튜브 오디오 보관함 등 무료 음악만 사용하세요.</small>';
      n.hidden = false;
      if (onChange) onChange();
    });
  }

  /* ---------------- 이벤트 ---------------- */
  function bind() {
    $('gModes').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b && !busy) setMode(b.dataset.m); });

    $('gPhotos').addEventListener('change', e => {
      [...e.target.files].forEach(f => photos.push({ file: f, blurs: [], url: URL.createObjectURL(f) }));
      e.target.value = ''; drawPhotos();
    });
    $('gPhotoList').addEventListener('click', e => {
      const i = +e.target.closest('[data-i]')?.dataset.i;
      if (e.target.closest('.g-del')) { URL.revokeObjectURL(photos[i].url); photos.splice(i, 1); drawPhotos(); }
      else if (e.target.closest('.g-blurbtn')) openBlur(photos[i], drawPhotos);
    });

    const baPick = (inp, set, box) => $(inp).addEventListener('change', e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const o = { file: f, blurs: [], url: URL.createObjectURL(f) }; set(o); drawBA(box, o);
    });
    baPick('gBefore', o => { baBefore = o; }, 'gBeforeBox');
    baPick('gAfter', o => { baAfter = o; }, 'gAfterBox');

    $('gVideo').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      if (video) URL.revokeObjectURL(video.url);
      try {
        const info = await MediaTools.videoInfo(f);
        video = { file: f, url: info.url, duration: info.duration };
        $('gVideoPrev').src = info.url; $('gVideoBox').hidden = false;
        $('gStart').max = Math.max(0, Math.floor(info.duration - 1)); $('gStart').value = 0; $('gStartTxt').textContent = '0초';
        if (info.duration > 180) toast('3분이 넘는 영상은 시간이 오래 걸릴 수 있어요. 유튜브 링크를 추천합니다.');
      } catch (err) { toast(err.message); }
    });
    $('gStart').addEventListener('input', e => { $('gStartTxt').textContent = e.target.value + '초'; $('gVideoPrev').currentTime = +e.target.value; });

    $('gYt').addEventListener('input', () => {
      const id = ytId($('gYt').value);
      $('gYtPrev').innerHTML = id ? `<img class="g-ytimg" src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" alt="유튜브 미리보기" />` : '';
    });

    $('gSlides').addEventListener('change', e => {
      [...e.target.files].forEach(f => { if (slides.length < 15) slides.push({ file: f, url: URL.createObjectURL(f) }); });
      e.target.value = ''; slideResult = null; $('gSlideOut').hidden = true; setMode('slideshow'); drawSlides();
    });
    $('gSlideList').addEventListener('click', e => {
      const el = e.target.closest('[data-i]'); if (!el) return; const i = +el.dataset.i;
      if (e.target.closest('.g-del')) { URL.revokeObjectURL(slides[i].url); slides.splice(i, 1); }
      else if (e.target.closest('.g-up') && i > 0) [slides[i - 1], slides[i]] = [slides[i], slides[i - 1]];
      else return;
      slideResult = null; $('gSlideOut').hidden = true; setMode('slideshow'); drawSlides();
    });
    ['gOrient', 'gPer'].forEach(id => $(id).addEventListener('change', () => { slideResult = null; $('gSlideOut').hidden = true; setMode('slideshow'); }));
    bindMusic('V');
    bindMusic('S', () => { if (slideResult) { slideResult = null; $('gSlideOut').hidden = true; setMode('slideshow'); } });
    document.querySelectorAll('.g-mprev').forEach(b => b.addEventListener('click', () => toggleMusicPreview(b)));

    $('gSubmit').addEventListener('click', submit);
    $('gListCat').addEventListener('change', e => { listCat = e.target.value; drawList(); });
    $('gList').addEventListener('click', listAction);

    // 얼굴 가리기 편집기
    $('gBlurUndo').addEventListener('click', () => { blurState.rects.pop(); paintBlur(); });
    $('gBlurClear').addEventListener('click', () => { blurState.rects = []; paintBlur(); });
    $('gBlurCancel').addEventListener('click', () => { $('gBlur').hidden = true; });
    $('gBlurOk').addEventListener('click', () => { blurState.target.blurs = blurState.rects.slice(); $('gBlur').hidden = true; blurState.done(); });
    const cv = $('gBlurCv'); let st = null;
    const pt = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); st = pt(e); blurState.rects.push({ x: st.x, y: st.y, w: 0, h: 0 }); });
    cv.addEventListener('pointermove', e => {
      if (!st) return; const p = pt(e), r = blurState.rects[blurState.rects.length - 1];
      r.x = Math.min(st.x, p.x); r.y = Math.min(st.y, p.y); r.w = Math.abs(p.x - st.x); r.h = Math.abs(p.y - st.y); paintBlur();
    });
    cv.addEventListener('pointerup', () => { st = null; blurState.rects = blurState.rects.filter(r => r.w > 0.01 && r.h > 0.01); paintBlur(); });
  }

  function drawPhotos() {
    $('gPhotoList').innerHTML = photos.map((p, i) => `
      <div class="g-th" data-i="${i}">
        <img src="${p.url}" alt="" />
        ${p.blurs.length ? `<span class="g-tag">가림 ${p.blurs.length}곳</span>` : ''}
        <button type="button" class="g-del" aria-label="빼기">×</button>
        <button type="button" class="g-blurbtn">얼굴 가리기</button>
      </div>`).join('');
  }
  function drawBA(boxId, o) {
    $(boxId).innerHTML = `<div class="g-th"><img src="${o.url}" alt="" />${o.blurs.length ? `<span class="g-tag">가림 ${o.blurs.length}곳</span>` : ''}<button type="button" class="g-blurbtn">얼굴 가리기</button></div>`;
    $(boxId).querySelector('.g-blurbtn').onclick = () => openBlur(o, () => drawBA(boxId, o));
  }
  function drawSlides() {
    $('gSlideList').innerHTML = slides.map((p, i) => `
      <div class="g-th" data-i="${i}"><img src="${p.url}" alt="" /><span class="g-num">${i + 1}</span>
        <button type="button" class="g-del" aria-label="빼기">×</button>${i > 0 ? '<button type="button" class="g-up" aria-label="앞으로">◀</button>' : ''}</div>`).join('');
  }

  /* ---------------- 얼굴 가리기 ---------------- */
  const blurState = { img: null, rects: [], target: null, done: null };
  async function openBlur(target, done) {
    const img = await MediaTools.decodeImage(target.file);
    blurState.img = img; blurState.rects = target.blurs.slice(); blurState.target = target; blurState.done = done;
    const cv = $('gBlurCv'), s = Math.min(1, 1400 / Math.max(img.width, img.height));
    cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
    $('gBlur').hidden = false; paintBlur();
  }
  function paintBlur() {
    const cv = $('gBlurCv'), ctx = cv.getContext('2d');
    ctx.drawImage(blurState.img, 0, 0, cv.width, cv.height);
    MediaTools.blurRegions(ctx, blurState.rects, cv.width, cv.height);
    ctx.strokeStyle = '#ffb020'; ctx.lineWidth = Math.max(2, cv.width / 300);
    blurState.rects.forEach(r => ctx.strokeRect(r.x * cv.width, r.y * cv.height, r.w * cv.width, r.h * cv.height));
  }

  /* ---------------- 유튜브 ---------------- */
  function ytId(u) {
    u = (u || '').trim();
    const m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(u) ? u : null);
  }

  /* ---------------- 올리기 ---------------- */
  async function submit() {
    if (busy) return;
    const base = common();
    stopMusicPreview();
    setBusy(true);
    try {
      if (mode === 'photo') {
        if (!photos.length) throw new Error('사진을 선택해 주세요');
        for (let i = 0; i < photos.length; i++) {
          progress(i / photos.length, `사진 ${i + 1}/${photos.length} 올리는 중…`);
          const p = photos[i];
          const big = await MediaTools.resizeImage(p.file, 1600, 0.84, p.blurs);
          const th = await MediaTools.thumbFromCanvas(big.canvas, 640);
          const media = await upload(newPath(base.category, 'jpg'), big.blob, 'image/jpeg');
          const thumb = await upload(newPath(base.category, 'jpg'), th, 'image/jpeg');
          await insert({ ...base, kind: 'photo', media_path: media, thumb_path: thumb, width: big.width, height: big.height });
        }
        photos.forEach(p => URL.revokeObjectURL(p.url)); photos = []; drawPhotos();
      } else if (mode === 'beforeafter') {
        if (!baBefore || !baAfter) throw new Error('작업 전·후 사진을 모두 선택해 주세요');
        progress(0.2, '작업 전 사진 올리는 중…');
        const b = await MediaTools.resizeImage(baBefore.file, 1600, 0.84, baBefore.blurs);
        progress(0.5, '작업 후 사진 올리는 중…');
        const a = await MediaTools.resizeImage(baAfter.file, 1600, 0.84, baAfter.blurs);
        // 작업 후 사진을 작업 전 사진과 같은 크기로 맞춤 (비교 슬라이더용)
        const c = document.createElement('canvas'); c.width = b.width; c.height = b.height;
        const cx = c.getContext('2d'); const sc = Math.max(c.width / a.width, c.height / a.height);
        cx.drawImage(a.canvas, (c.width - a.width * sc) / 2, (c.height - a.height * sc) / 2, a.width * sc, a.height * sc);
        const aBlob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.84));
        const th = await MediaTools.thumbFromCanvas(c, 640);
        const media = await upload(newPath(base.category, 'jpg'), b.blob, 'image/jpeg');
        const after = await upload(newPath(base.category, 'jpg'), aBlob, 'image/jpeg');
        const thumb = await upload(newPath(base.category, 'jpg'), th, 'image/jpeg');
        await insert({ ...base, kind: 'beforeafter', media_path: media, after_path: after, thumb_path: thumb, width: b.width, height: b.height });
        baBefore = baAfter = null; $('gBeforeBox').innerHTML = $('gAfterBox').innerHTML = '';
      } else if (mode === 'video') {
        if (!video) throw new Error('영상을 선택해 주세요');
        const out = await MediaTools.processVideo(video.file, {
          start: +$('gStart').value, duration: +$('gLen').value, music: musicOpt('V', base.category),
          onProgress: p => progress(p * 0.85, `자동 편집 중… ${Math.round(p * 100)}% (화면을 켜 두세요)`)
        });
        progress(0.9, `올리는 중… (${(out.blob.size / 1048576).toFixed(1)}MB)`);
        const ext = out.mime.includes('mp4') ? 'mp4' : 'webm';
        const media = await upload(newPath(base.category, ext), out.blob, out.mime);
        const thumb = await upload(newPath(base.category, 'jpg'), out.thumb, 'image/jpeg');
        await insert({ ...base, kind: 'video', media_path: media, thumb_path: thumb, width: out.width, height: out.height });
        URL.revokeObjectURL(video.url); video = null; $('gVideoBox').hidden = true; $('gVideoPrev').removeAttribute('src');
      } else if (mode === 'youtube') {
        const id = ytId($('gYt').value);
        if (!id) throw new Error('유튜브 주소를 확인해 주세요');
        await insert({ ...base, kind: 'youtube', youtube_id: id });
        $('gYt').value = ''; $('gYtPrev').innerHTML = '';
      } else if (mode === 'slideshow') {
        if (!slideResult) {
          if (slides.length < 2) throw new Error('사진을 2장 이상 선택해 주세요');
          const out = await MediaTools.photosToVideo(slides.map(s => ({ file: s.file, label: base.caption || '' })), {
            orientation: $('gOrient').value, perPhoto: +$('gPer').value, music: musicOpt('S', base.category),
            subtitle: (base.caption || CATS[base.category] + ' 현장'),
            onProgress: p => progress(p, `홍보영상 만드는 중… ${Math.round(p * 100)}% (화면을 켜 두세요)`)
          });
          slideResult = out;
          const url = URL.createObjectURL(out.blob);
          $('gSlidePrev').src = url; $('gSlideOut').hidden = false;
          $('gSlideDown').href = url; $('gSlideDown').download = `일잡코리아_${CATS[base.category].replace(/[^\w가-힣]/g, '')}_${today()}.${out.mime.includes('mp4') ? 'mp4' : 'webm'}`;
          progress(null); setMode('slideshow');
          $('gSlideOut').scrollIntoView({ behavior: 'smooth', block: 'center' });
          toast('홍보영상이 완성됐어요. 확인 후 [갤러리에 올리기] 또는 [휴대폰에 저장]을 누르세요.');
          return;
        }
        progress(0.5, '올리는 중…');
        const ext = slideResult.mime.includes('mp4') ? 'mp4' : 'webm';
        const media = await upload(newPath(base.category, ext), slideResult.blob, slideResult.mime);
        const thumb = await upload(newPath(base.category, 'jpg'), slideResult.thumb, 'image/jpeg');
        await insert({ ...base, kind: 'video', media_path: media, thumb_path: thumb, width: slideResult.width, height: slideResult.height });
        slides.forEach(s => URL.revokeObjectURL(s.url)); slides = []; slideResult = null; drawSlides(); $('gSlideOut').hidden = true; setMode('slideshow');
      }
      progress(1, '완료!');
      toast(base.published ? '올렸습니다. 현장 갤러리에 바로 공개됩니다.' : '올렸습니다. (비공개 상태)');
      setTimeout(() => progress(null), 1200);
      await loadList();
    } catch (err) {
      progress(null); toast(err.message || String(err));
    } finally { setBusy(false); }
  }
  async function insert(row) {
    const { error } = await sb.from('gallery_items').insert(row);
    if (error) throw new Error('저장 실패: ' + error.message);
  }

  /* ---------------- 목록 (현장 묶음 단위) ---------------- */
  // 분야 · 날짜 · 지역 · 설명이 같으면(띄어쓰기 무시) 한 현장
  const groupKey = it => [it.category, it.taken_on || '', (it.location || '').replace(/\s+/g, ''), (it.caption || '').replace(/\s+/g, '')].join('|');
  const isVid = it => it.kind === 'video' || it.kind === 'youtube';
  const KIND_TXT = { photo: '사진', beforeafter: '전·후', video: '영상', youtube: '유튜브' };
  const openGroups = new Set();
  let groups = [];

  async function loadList() {
    const { data, error } = await sb.from('gallery_items').select('*').order('taken_on', { ascending: false }).order('id', { ascending: false }).limit(1000);
    if (error) {
      $('gList').innerHTML = `<p class="g-tip">갤러리 목록을 불러오지 못했습니다. (${esc(error.message)})<br>Supabase 에서 <b>gallery_setup.sql</b> 을 실행했는지 확인해 주세요.</p>`;
      return;
    }
    items = data || [];
    const map = new Map();
    items.forEach(it => { const k = groupKey(it); if (!map.has(k)) map.set(k, []); map.get(k).push(it); });
    groups = [...map.entries()].map(([key, L]) => {
      L.sort((a, b) => (isVid(b) - isVid(a)) || (a.id - b.id));
      const first = L.reduce((m, x) => x.id < m.id ? x : m, L[0]);
      return { key, L, first, cover: L.find(isVid) || first, photos: L.filter(x => !isVid(x)), videos: L.filter(isVid) };
    });
    drawList();
  }
  function drawList() {
    const G = groups.filter(g => !listCat || g.first.category === listCat);
    $('gCount').textContent = `현장 ${G.length}곳 · ${G.reduce((n, g) => n + g.L.length, 0)}개`;
    $('gList').innerHTML = G.length ? G.map((g, gi) => {
      const shown = g.L.filter(x => x.published).length;
      const pShown = g.photos.filter(x => x.published).length;
      const vShown = g.videos.filter(x => x.published).length;
      const counts = [g.photos.length ? `사진 ${g.photos.length}` : '', g.videos.length ? `영상 ${g.videos.length}` : ''].filter(Boolean).join(' · ');
      const state = shown === 0 ? '<em class="g-st off">전체 숨김</em>' : shown < g.L.length ? `<em class="g-st part">${g.L.length - shown}개 숨김</em>` : '<em class="g-st on">모두 공개</em>';
      const btns = [];
      if (g.videos.length && g.photos.length) {
        btns.push(pShown ? `<button type="button" class="btn btn-amber" data-g="photosOff">📷 사진 숨기고 영상만 보이기</button>`
                         : `<button type="button" class="btn btn-light" data-g="photosOn">📷 사진 다시 보이기</button>`);
        if (!vShown) btns.push(`<button type="button" class="btn btn-light" data-g="videosOn">🎬 영상 다시 보이기</button>`);
      }
      btns.push(shown ? `<button type="button" class="btn btn-light" data-g="allOff">현장 전체 숨기기</button>` : `<button type="button" class="btn btn-light" data-g="allOn">현장 전체 공개</button>`);
      if (g.L.length > 1) btns.push(`<button type="button" class="btn btn-light" data-g="toggle">${openGroups.has(g.key) ? '접기 ▴' : '하나씩 보기 ▾'}</button>`);
      const tiles = (g.L.length === 1 || openGroups.has(g.key)) ? `<div class="g-tiles">${g.L.map(it => `
          <div class="g-item${it.published ? '' : ' off'}" data-id="${it.id}">
            <div class="g-ph"><img src="${esc(thumbOf(it))}" alt="" loading="lazy" /><span class="g-kind">${KIND_TXT[it.kind]}${it.published ? '' : ' · 숨김'}</span></div>
            <div class="g-act">
              <button type="button" class="btn btn-light" data-a="toggle">${it.published ? '숨기기' : '공개하기'}</button>
              <button type="button" class="btn btn-danger" data-a="del">삭제</button>
            </div>
          </div>`).join('')}</div>` : '';
      return `
      <div class="g-group${shown ? '' : ' off'}" data-gi="${gi}">
        <div class="g-gtop">
          <div class="g-gph"><img src="${esc(thumbOf(g.cover))}" alt="" loading="lazy" />${g.videos.length ? '<span class="g-kind">▶ 영상</span>' : ''}${g.L.length > 1 ? `<span class="g-gn">${g.L.length}</span>` : ''}</div>
          <div class="g-gtx">
            <b>${esc(g.first.caption || '(설명 없음)')}</b>
            <span>${esc(CATS[g.first.category])} · ${esc(g.first.taken_on || '')}${g.first.location ? ' · ' + esc(g.first.location) : ''}</span>
            <span>${counts} ${state}</span>
            <div class="g-gbtn">${btns.join('')}</div>
          </div>
        </div>${tiles}
      </div>`;
    }).join('') : '<p class="g-tip">아직 올린 사진·영상이 없습니다.</p>';
    G.forEach((g, gi) => { const el = $('gList').querySelector(`[data-gi="${gi}"]`); if (el) el._g = g; });
  }
  async function setPublished(list, value, msg) {
    const ids = list.filter(x => x.published !== value).map(x => x.id);
    if (!ids.length) return;
    const { error } = await sb.from('gallery_items').update({ published: value }).in('id', ids);
    if (error) return toast('변경 실패: ' + error.message);
    toast(msg); loadList();
  }
  async function listAction(e) {
    const gb = e.target.closest('[data-g]');
    if (gb) {
      const g = gb.closest('.g-group')._g; if (!g) return;
      const a = gb.dataset.g;
      if (a === 'toggle') { openGroups.has(g.key) ? openGroups.delete(g.key) : openGroups.add(g.key); drawList(); return; }
      if (a === 'photosOff') return setPublished(g.photos, false, `사진 ${g.photos.length}장을 숨겼습니다. 홈페이지에는 영상만 보입니다.`);
      if (a === 'photosOn') return setPublished(g.photos, true, '사진을 다시 공개했습니다');
      if (a === 'videosOn') return setPublished(g.videos, true, '영상을 다시 공개했습니다');
      if (a === 'allOff') return setPublished(g.L, false, '이 현장을 갤러리에서 숨겼습니다');
      if (a === 'allOn') return setPublished(g.L, true, '이 현장을 갤러리에 공개했습니다');
      return;
    }
    const b = e.target.closest('[data-a]'); if (!b) return;
    const it = items.find(x => String(x.id) === b.closest('[data-id]').dataset.id); if (!it) return;
    if (b.dataset.a === 'toggle') {
      const { error } = await sb.from('gallery_items').update({ published: !it.published }).eq('id', it.id);
      if (error) return toast('변경 실패: ' + error.message);
      toast(it.published ? '갤러리에서 숨겼습니다' : '갤러리에 공개했습니다'); loadList();
    } else if (b.dataset.a === 'del') {
      if (!confirm('이 사진·영상을 삭제할까요? 되돌릴 수 없습니다.\n(삭제 대신 [숨기기]를 쓰면 나중에 다시 공개할 수 있어요)')) return;
      const paths = [it.media_path, it.after_path, it.thumb_path].filter(Boolean);
      if (paths.length) await sb.storage.from('gallery').remove(paths);
      const { error } = await sb.from('gallery_items').delete().eq('id', it.id);
      if (error) return toast('삭제 실패: ' + error.message);
      toast('삭제했습니다'); loadList();
    }
  }

  window.AdminGallery = {
    init(ctx) { sb = ctx.sb; toast = ctx.toast; cfg = window.ILJOB_CONFIG || {}; if (!$('gModes')) mount(); loadList(); }
  };
})();
