/* DY-AI 인증: Supabase Auth (이메일+비밀번호). config.js, supabase-js 다음에 로드 */
(function () {
  "use strict";

  var cfg = window.DY_CONFIG || {};
  var configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    cfg.SUPABASE_URL.indexOf("YOUR-PROJECT") === -1 && cfg.SUPABASE_ANON_KEY !== "YOUR-ANON-KEY";

  var client = configured && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  function toEmail(id) {
    id = String(id || "").trim();
    return id.indexOf("@") >= 0 ? id : id + "@" + (cfg.LOGIN_EMAIL_DOMAIN || "dy-ai.local");
  }

  function notConfigured() {
    return Promise.reject(new Error("Supabase 설정(assets/config.js)이 비어 있어요"));
  }

  // 확장 프로그램(Q10 수집)이 수집기 페이지 없이도 저장할 수 있게 로그인 세션을 넘겨 둔다 (refresh_token 은 넘기지 않음: 확장이 갱신하면 이 페이지의 세션이 깨짐)
  function pushSession(s) {
    window.postMessage({ source: "dy-ai", type: "session", session: s && s.access_token ? {
      url: cfg.SUPABASE_URL, anonKey: cfg.SUPABASE_ANON_KEY, origin: location.origin, access_token: s.access_token, expires_at: s.expires_at, email: s.user && s.user.email
    } : null }, location.origin);
  }
  if (client) {
    client.auth.getSession().then(function (res) { pushSession(res.data && res.data.session); }).catch(function () {});
    client.auth.onAuthStateChange(function (ev, s) { pushSession(s); });
  }

  window.dyAuth = {
    ready: !!client,

    signIn: function (id, password) {
      if (!client) return notConfigured();
      return client.auth.signInWithPassword({ email: toEmail(id), password: password })
        .then(function (res) { if (res.error) throw res.error; return res.data.session; });
    },

    signOut: function () {
      if (!client) return Promise.resolve();
      return client.auth.signOut();
    },

    getSession: function () {
      if (!client) return Promise.resolve(null);
      return client.auth.getSession().then(function (res) { return res.data.session; });
    },

    // 로그인 안 돼 있으면 로그인 화면으로 보냄
    requireLogin: function () {
      return this.getSession().then(function (s) {
        if (!s) location.replace("/");
        return s;
      });
    },

    client: client
  };
})();
