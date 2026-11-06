/* DY-AI 설정: Supabase 공개값만 넣는 곳 (service_role key는 절대 넣지 말 것) */
window.DY_CONFIG = {
  // Settings → Data API → Project URL (또는 상단 Connect 버튼)
  SUPABASE_URL: "https://dlgyvqcfastqguudzcob.supabase.co",
  // Settings → API Keys → Publishable key (sb_publishable_...)
  // (레거시 anon key도 동작하지만 2027년 초 폐지 예정. secret key는 절대 넣지 말 것)
  SUPABASE_ANON_KEY: "sb_publishable_gpElJE3Ag9JVB_9z2wWwqA_2kheALPF",
  // 아이디만 입력하면 붙일 이메일 도메인 (계정을 dy@dy-ai.local 로 만들었다면 "dy-ai.local")
  // 아이디 칸에 이메일 전체(@ 포함)를 입력하면 그대로 사용
  LOGIN_EMAIL_DOMAIN: "dy-ai.local"
};
