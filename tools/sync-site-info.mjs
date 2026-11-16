// 홈페이지 정보(관리자 [🏢 홈페이지 정보])를 원본 파일에도 반영합니다.
// 화면 글자는 site-info.js 가 바로 바꾸지만, 검색 로봇·카카오톡 미리보기·앱 설치 이름은 원본 파일만 읽기 때문에
// GitHub Actions(.github/workflows/sync-site-info.yml)가 30분마다 이 파일을 실행해 원본을 맞춥니다.
//   1) Supabase site_settings 에서 지금 값을 읽음 (누구나 읽을 수 있는 값만)
//   2) site-static.json(원본에 마지막으로 적힌 값)과 다르면 아래 파일들의 글자를 한 번에 바꿈
//   3) site-static.json 을 새 값으로 저장 → 바뀐 것이 있으면 워크플로가 커밋·배포
// 직접 실행: node tools/sync-site-info.mjs
import { readFileSync, writeFileSync } from "node:fs";

const FILES = [
  "index.html", "gallery.html", "privacy.html", "admin.html",
  "manifest.webmanifest", "admin.webmanifest", "media-tools.js", "site-info.js",
];
const KEYS = ["brand", "branch", "ceo", "phone", "address", "service_area"];

const cfg = readFileSync("config.js", "utf8");
const pick = (name) => (cfg.match(new RegExp(name + '\\s*:\\s*"([^"]+)"')) || [])[1];
const url = pick("SUPABASE_URL"), key = pick("SUPABASE_ANON_KEY");
if (!url || !key) { console.error("config.js 에서 연결 정보를 찾지 못했습니다."); process.exit(1); }

const res = await fetch(url.replace(/\/$/, "") + "/rest/v1/site_settings?id=eq.1&select=*", {
  headers: { apikey: key, Authorization: "Bearer " + key },
});
if (!res.ok) { console.error("설정을 불러오지 못했습니다:", res.status); process.exit(1); }
const row = (await res.json())[0];
if (!row) { console.log("설정이 없습니다. 바꿀 것 없음."); process.exit(0); }

const old = JSON.parse(readFileSync("site-static.json", "utf8"));
const cur = {};
for (const k of KEYS) {
  const v = typeof row[k] === "string" ? row[k].trim() : "";
  cur[k] = v || (k === "branch" ? "" : old[k]);   // 지점명만 비워 둘 수 있음
}

const digits = (s) => String(s).replace(/\D/g, "");
const shortAddr = (a) => a.replace(/^강원(특별자치)?도\s*/, "");
const full = (o) => (o.brand + " " + o.branch).trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// 대표 지역명 (제목의 "○○ 전문 인력사무소"): 서비스 지역의 첫 지역. site-info.js 의 deriveArea 와 같은 규칙
const deriveArea = (s) => String(s || "").trim().split(/\s*(?:및|,|·|\/)\s*|\s+/)[0] || "";

// site-info.js 의 buildPairs 와 같은 규칙 (긴 것부터, 한 번에 바꿔서 새 글자가 다시 바뀌지 않게)
const list = [
  [full(old), full(cur)], [old.branch, cur.branch], [old.brand, cur.brand],
  [old.phone, cur.phone], [digits(old.phone), digits(cur.phone)],
  [old.address, cur.address], [encodeURIComponent(old.address), encodeURIComponent(cur.address)],
  [shortAddr(old.address), shortAddr(cur.address)],
  [old.ceo, cur.ceo], [old.service_area, cur.service_area],
  [deriveArea(old.service_area), deriveArea(cur.service_area)],   // 짧은 지역명 (원주 → 새 지역명)
];
const map = {};
for (const [a, b] of list) if (a && a !== b && a.length >= 2 && !(a in map)) map[a] = b;
if (!Object.keys(map).length) { console.log("원본과 같습니다. 바꿀 것 없음."); process.exit(0); }
// 주소는 바뀌지 않더라도 그 안의 지역명(원주시)이 따로 바뀌지 않게 통째로 보호
for (const g of [old.address, shortAddr(old.address), encodeURIComponent(old.address)]) if (g && g.length >= 2 && !(g in map)) map[g] = g;
const froms = Object.keys(map).sort((x, y) => y.length - x.length);
const re = new RegExp(froms.map(esc).join("|"), "g");

for (const f of FILES) {
  const s = readFileSync(f, "utf8");
  const t = s.replace(re, (m) => map[m]);
  if (t !== s) { writeFileSync(f, t); console.log("바꿈:", f); }
}
writeFileSync("site-static.json", JSON.stringify(cur, null, 2) + "\n");
console.log("반영:", JSON.stringify(map));
