/* =========================================================
   일잡코리아 강원본부 - 데이터베이스 연결 정보
   홈페이지(index.html)와 관리자 페이지(admin.html)가 함께 사용합니다.

   Supabase 대시보드 → Project Settings → API 에서 복사해 넣으세요.
     SUPABASE_URL      : Project URL        (예: https://abcdefgh.supabase.co)
     SUPABASE_ANON_KEY : anon public 키      (eyJ... 로 시작하는 긴 글자)

   ※ anon 키는 홈페이지에 공개되어도 되는 키입니다. (보안 규칙으로 접수만 가능)
   ※ service_role 키는 절대 여기에 넣지 마세요.
   ========================================================= */
window.ILJOB_CONFIG = {
  SUPABASE_URL: "https://ekvwkcojptfkfhidgwpj.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_iGrHm1cgW48enfiKoYZaPA_3QRlomh-",
  // ── 접수 전용 연결 (인력배치 프로그램의 접수함) ──────────────────────
  // 비워 두면 접수가 기존 연결(위 SUPABASE_URL)로 들어갑니다.
  // 시험이 끝난 뒤 아래 두 칸을 채우면 접수가 새 접수함으로 들어갑니다. (갤러리는 영향 없음)
  INQUIRY_URL: "https://ctdbehqjrpagxfhbmktx.supabase.co",
  INQUIRY_ANON_KEY: "sb_publishable_BzoaNo6ZV2GV_U_rl0sbbQ_5FeyGd5c"
};
