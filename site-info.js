/* =========================================================
   일잡코리아 - 홈페이지 기본 정보(상호·전화·주소·대표 등) 불러오기
   관리자 페이지 [🏢 홈페이지 정보] 에서 고친 값을 Supabase 의 site_settings 표에서 읽어
   페이지 안의 글자를 바꿔 줍니다. (HTML 안의 글자는 처음 기본값이고, 이 파일이 새 값으로 바꿈)
   - 이전에 받은 값은 브라우저에 저장해 두었다가 먼저 보여 주고, 새 값이 오면 다시 바꿈
   - 불러오지 못하면 기본값 그대로 보임 (홈페이지는 계속 정상 동작)
   ========================================================= */
(function () {
  var DEFAULTS = {
    brand: '일잡코리아', branch: '본부', ceo: '박신형',
    phone: '033-731-5282', sms: '01084943848',
    address: '강원특별자치도 원주시 무실로 58',
    biz_no: '', job_no: '', kakao_url: '', hours: '',
    service_area: '원주 및 강원 전 지역',   // 서비스 지역 ("오시는 길"·소개 문구)
    inquiry_target: 'new'          // 접수 받을 곳: new=인력배치 접수함, old=옛 관리자 페이지, both=둘 다
  };
  var KEYS = Object.keys(DEFAULTS);
  // <script src="site-info.js" data-scope=".brand"> 처럼 쓰면 그 부분의 글자만 바꿈 (관리자 페이지: 손님 접수 내용은 건드리지 않도록)
  var SCOPE = document.currentScript && document.currentScript.getAttribute('data-scope');
  // 지점 홈페이지: 주소 뒤에 ?b=지점코드 가 붙어 있으면 그 지점의 정보(인력배치 프로그램 지점 관리에서 입력)를 보여 줌. 관리자 페이지는 해당 없음
  var CODE = SCOPE ? '' : (new URLSearchParams(location.search).get('b') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
  var CACHE = 'iljob_site_v1' + (CODE ? '_' + CODE : '');
  var ATTRS = ['href', 'src', 'title', 'alt', 'aria-label', 'content'];

  var OPTIONAL = { branch: 1, biz_no: 1, job_no: 1, kakao_url: 1, hours: 1 };   // 비워 둘 수 있는 항목

  function clean(src) {
    var o = {};
    KEYS.forEach(function (k) {
      var v = src && typeof src[k] === 'string' ? src[k].trim() : null;
      o[k] = v === null ? DEFAULTS[k] : (v === '' && !OPTIONAL[k] ? DEFAULTS[k] : v);
    });
    o.sms = o.sms.replace(/\D/g, '') || DEFAULTS.sms;
    if (o.inquiry_target !== 'old' && o.inquiry_target !== 'both') o.inquiry_target = 'new';
    if (CODE) o.inquiry_target = 'new';   // 지점 홈페이지의 접수는 항상 인력배치 프로그램의 그 지점 접수함으로
    return o;
  }

  var cur = clean(null);
  var cached = false;
  try { var c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c) { cur = clean(c); cached = true; } } catch (_) {}
  // 지점 홈페이지를 처음 열 때는 정보가 오기 전까지 잠깐 숨겨서, 본점 전화번호가 먼저 보이는 일이 없게 함
  var hidden = false;
  function reveal() { if (hidden) { hidden = false; document.documentElement.style.visibility = ''; } }
  if (CODE && !cached) { hidden = true; document.documentElement.style.visibility = 'hidden'; setTimeout(reveal, 2500); }
  var prev = clean(null);            // 지금 화면의 글자가 어떤 값으로 되어 있는지 (처음엔 기본값)

  function digits(s) { return String(s).replace(/\D/g, ''); }
  function shortAddr(a) { return a.replace(/^강원(특별자치)?도\s*/, ''); }
  function full(o) { return (o.brand + ' ' + o.branch).trim(); }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // 바꿀 (이전 → 새) 목록. 한 번에 바꿔서 새 글자가 다시 바뀌는 일이 없게 함
  function buildPairs(a, b) {
    var list = [
      [full(a), full(b)],
      [a.branch, b.branch],
      [a.brand, b.brand],
      [a.phone, b.phone],
      [digits(a.phone), digits(b.phone)],
      [a.address, b.address],
      [encodeURIComponent(a.address), encodeURIComponent(b.address)],
      [shortAddr(a.address), shortAddr(b.address)],
      [a.ceo, b.ceo],
      [a.service_area, b.service_area]
    ];
    var map = {};
    list.forEach(function (p) { if (p[0] && p[0] !== p[1] && p[0].length >= 2 && !(p[0] in map)) map[p[0]] = p[1]; });
    var froms = Object.keys(map).sort(function (x, y) { return y.length - x.length; });
    if (!froms.length) return null;
    return { re: new RegExp(froms.map(reEsc).join('|'), 'g'), map: map };
  }

  function apply() {
    var pairs = buildPairs(prev, cur);
    if (pairs) {
      var rep = function (s) { return s.replace(pairs.re, function (m) { return pairs.map[m]; }); };
      var roots = SCOPE ? Array.prototype.slice.call(document.querySelectorAll(SCOPE)) : [document.documentElement];
      if (!SCOPE && document.title) document.title = rep(document.title);
      roots.forEach(function (root) {
        var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode: function (n) {
            var p = n.parentNode && n.parentNode.nodeName;
            return /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT|TITLE)$/.test(p) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
          }
        });
        var node, nodes = [];
        while ((node = w.nextNode())) nodes.push(node);
        nodes.forEach(function (t) { var v = rep(t.nodeValue); if (v !== t.nodeValue) t.nodeValue = v; });
        var els = Array.prototype.slice.call(root.querySelectorAll('[href],[src],[title],[alt],[aria-label],meta[content]'));
        els.push(root);
        els.forEach(function (el) {
          ATTRS.forEach(function (a) {
            var v = el.getAttribute && el.getAttribute(a);
            if (v) { var nv = rep(v); if (nv !== v) el.setAttribute(a, nv); }
          });
        });
        if (prev.brand !== cur.brand) {
          root.querySelectorAll('.logo-mark, .brand .mk').forEach(function (m) { m.textContent = cur.brand.charAt(0); });
        }
      });
    }
    // 운영 시간 (있을 때만 보임)
    var hr = document.getElementById('hoursRow'), hv = document.getElementById('hoursVal');
    if (hr && hv) { hv.textContent = cur.hours; hr.style.display = cur.hours ? '' : 'none'; }
    prev = JSON.parse(JSON.stringify(cur));
  }

  var ready = function () { apply(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();

  // 다른 코드가 쓸 수 있는 현재 값
  window.SITE = cur;
  window.SITE_DEFAULTS = DEFAULTS;
  window.SITE_BRANCH = CODE;   // 지점 홈페이지의 주소 코드 (본점 홈페이지는 빈 글자). 접수를 그 지점으로 보낼 때 사용

  // 새 값 받아오기 (anon 읽기 전용)
  //  · 본점: 홈페이지 데이터베이스의 site_settings
  //  · 지점(?b=코드): 인력배치 프로그램 데이터베이스의 공개 함수 public_branch_site
  function refresh() {
    var cfg = window.ILJOB_CONFIG || {};
    if (!window.fetch) { reveal(); return; }
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
    var req;
    if (CODE) {
      if (!cfg.INQUIRY_URL || !cfg.INQUIRY_ANON_KEY) { reveal(); return; }
      req = fetch(cfg.INQUIRY_URL.replace(/\/$/, '') + '/rest/v1/rpc/public_branch_site', {
        method: 'POST',
        headers: { apikey: cfg.INQUIRY_ANON_KEY, Authorization: 'Bearer ' + cfg.INQUIRY_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_code: CODE }),
        signal: ctl ? ctl.signal : undefined
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (row) { return row && row.code ? row : null; });
    } else {
      if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
      req = fetch(cfg.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/site_settings?id=eq.1&select=*', {
        headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY },
        signal: ctl ? ctl.signal : undefined
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (rows) { return rows && rows[0] ? rows[0] : null; });
    }
    req.then(function (row) {
      if (timer) clearTimeout(timer);
      if (!row) { reveal(); return; }
      var next = clean(row);
      try { localStorage.setItem(CACHE, JSON.stringify(next)); } catch (_) {}
      cur = next; window.SITE = cur;
      if (document.readyState !== 'loading') apply();
      reveal();
      document.dispatchEvent(new CustomEvent('siteinfo', { detail: cur }));
    }).catch(function () { reveal(); });
  }
  refresh();

  // 지점 홈페이지 안에서 다른 쪽(개인정보처리방침·갤러리)으로 가도 같은 지점으로 보이도록 주소에 ?b= 를 붙여 줌
  if (CODE) {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var h = a.getAttribute('href');
      if (!h || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(h) || !/\.html([?#]|$)/i.test(h) || /^admin\.html/i.test(h)) return;
      try {
        var u = new URL(h, location.href);
        if (u.origin !== location.origin || u.searchParams.has('b')) return;
        u.searchParams.set('b', CODE);
        a.href = u.href;
      } catch (_) {}
    }, true);
  }

  // 관리자 페이지에서 저장한 직후 현재 화면에도 반영할 때 사용
  window.SiteInfo = {
    set: function (row) {
      var next = clean(row);
      try { localStorage.setItem(CACHE, JSON.stringify(next)); } catch (_) {}
      cur = next; window.SITE = cur; apply();
      document.dispatchEvent(new CustomEvent('siteinfo', { detail: cur }));
    }
  };
})();
