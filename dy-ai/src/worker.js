/* DY-AI Worker: 정적 파일(public/)은 그대로 내보내고, /api/* 만 처리한다.
 *
 * 구글 시트 프록시 (서비스 계정 키는 브라우저에 둘 수 없어서 Worker 가 대신 호출)
 *   GET  /api/sheet/status                       → { ok, configured, title }
 *   POST /api/sheet/prepare   {name, rows, cols, header}  → 탭이 없으면 만들고(헤더 포함) 행 수 확보
 *   GET  /api/sheet/col?name=raw_data&col=A      → 그 열의 값 목록
 *   PUT  /api/sheet/values?name=..&range=A5:L90  → 본문({values})을 그대로 Sheets API 로 (USER_ENTERED)
 *   POST /api/sheet/clear?name=..&range=A9:L99   → 값만 지움
 * 모든 요청은 Supabase 로그인 토큰(Authorization: Bearer ...)이 있어야 한다.
 * 쓸 수 있는 탭은 raw_data / raw_trade / raw_conversion 세 개뿐.
 *
 * 예약 작업 (wrangler.jsonc 의 triggers.crons, UTC 기준) — 예전 cron-job.org + GitHub Actions 를 대체
 *   20 15 * * *  (매일 00:20 KST) Q10 랭킹 수집 → DB            (src/rank_collect.js)
 *   0 0 * * 1    (월요일 09:00 KST) 주간 랭킹 리포트 메일          (src/rank_report.js)
 *   0 14 * * *   (매일 23:00 KST) 행사(메가와리) 랭킹 수집 → DB     (src/event_collect.js, 사이트에서 SID 를 켜 둔 때만)
 * 수동 실행: POST /api/cron/rank?only=daily|weekly|monthly&dry=1, POST /api/cron/report?dry=1, POST /api/cron/event?dry=1&sid=..&force=1&probe=상품번호  (헤더 x-cron-token = secret CRON_TOKEN)
 *
 * secret (wrangler secret put): GOOGLE_SA_JSON(서비스 계정 JSON), SHEET_ID,
 *   SUPABASE_SERVICE_KEY(랭킹 표 쓰기), CRON_TOKEN(수동 실행), RESEND_API_KEY, RECEIVER_EMAIL(메일)
 * vars (wrangler.jsonc): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
 */
import { collectRank } from "./rank_collect.js";
import { collectEvent } from "./event_collect.js";
import { sendWeeklyReport, sendResend } from "./rank_report.js";

const SHEETS = new Set(["raw_data", "raw_trade", "raw_conversion"]);
const RANGE_RE = /^[A-Z]{1,3}[1-9][0-9]{0,6}:[A-Z]{1,3}[1-9][0-9]{0,6}$/;
const COL_RE = /^[A-Z]{1,3}$/;
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets/";

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(event.cron, env, event.scheduledTime));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      if (url.pathname.startsWith("/api/cron/")) return await manualCron(req, env, url);
      const user = await checkUser(req, env);
      if (!user) return json({ error: "로그인이 필요해요" }, 401);
      if (url.pathname === "/api/event/collect" && req.method === "POST") { // 행사 랭킹 '지금 한 번 수집' (menu.event 권한)
        await needPerm(req, env, "menu.event");
        return json(await collectEvent(env, Date.now(), { sid: url.searchParams.get("sid") || undefined, force: true }));
      }
      if (url.pathname.startsWith("/api/admin/")) return await adminApi(req, env, url);
      await needPerm(req, env, "feat.collect");   // 구글 시트 프록시는 수집 권한이 있는 계정만
      return await route(req, env, url);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, e && e.status ? e.status : 500);
    }
  }
};

async function route(req, env, url) {
  const p = url.pathname;
  if (p === "/api/sheet/status" && req.method === "GET") {
    if (!env.GOOGLE_SA_JSON || !env.SHEET_ID) return json({ ok: true, configured: false });
    const meta = await sheetMeta(env);
    return json({ ok: true, configured: true, title: meta.properties.title });
  }
  if (!env.GOOGLE_SA_JSON || !env.SHEET_ID) return json({ error: "구글 시트 설정(GOOGLE_SA_JSON, SHEET_ID)이 Worker 에 없어요" }, 503);

  if (p === "/api/sheet/prepare" && req.method === "POST") {
    const b = await req.json();
    const name = sheetName(b.name);
    const rows = Math.max(1, Math.min(2000000, b.rows | 0));
    const cols = Math.max(1, Math.min(200, b.cols | 0));
    return json(await prepare(env, name, rows, cols, Array.isArray(b.header) ? b.header.slice(0, cols).map(String) : null));
  }
  if (p === "/api/sheet/col" && req.method === "GET") {
    const name = sheetName(url.searchParams.get("name"));
    const col = url.searchParams.get("col") || "";
    if (!COL_RE.test(col)) throw httpError(400, "열 이름이 올바르지 않아요");
    const r = await gapi(env, "values/" + enc(a1(name, col + ":" + col)) + "?majorDimension=COLUMNS");
    return json({ values: (r.values && r.values[0]) || [] });
  }
  if (p === "/api/sheet/values" && req.method === "PUT") {
    const name = sheetName(url.searchParams.get("name"));
    const range = checkRange(url.searchParams.get("range"));
    // 큰 본문은 해석하지 않고 그대로 넘김 (Worker CPU 를 거의 안 씀)
    const r = await gapi(env, "values/" + enc(a1(name, range)) + "?valueInputOption=USER_ENTERED",
      { method: "PUT", body: req.body, headers: { "Content-Type": "application/json" }, duplex: "half" });
    return json({ updatedRows: r.updatedRows || 0, updatedRange: r.updatedRange });
  }
  if (p === "/api/sheet/clear" && req.method === "POST") {
    const name = sheetName(url.searchParams.get("name"));
    const range = checkRange(url.searchParams.get("range"));
    const r = await gapi(env, "values/" + enc(a1(name, range)) + ":clear", { method: "POST", body: "{}" });
    return json({ clearedRange: r.clearedRange });
  }
  return json({ error: "없는 API 예요" }, 404);
}

// ---------- 로그인 확인 (Supabase 토큰) ----------
const userCache = new Map(); // token → { email, until }
async function checkUser(req, env) {
  const h = req.headers.get("Authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const hit = userCache.get(token);
  if (hit && hit.until > Date.now()) return hit;
  const r = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + token }
  });
  if (!r.ok) return null;
  const u = await r.json();
  const v = { email: u.email, until: Date.now() + 60000 };
  if (userCache.size > 200) userCache.clear();
  userCache.set(token, v);
  return v;
}

// ---------- 관리(계정 생성·비밀번호·사용 중지·삭제): 관리자만. Supabase Auth Admin API 는 service key 가 필요해서 Worker 가 한다 ----------
// 권한(메뉴·탭·기능) 읽기·쓰기는 DB 함수(dy_admin_users, dy_admin_set_perms)가 한다. 여기서는 계정 자체만 다룬다
const LOGIN_DOMAIN = "dy-ai.local";
async function sb(env, method, path, body, extra) {
  const r = await fetch(env.SUPABASE_URL + path, {
    method, headers: Object.assign({ apikey: env.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY, "Content-Type": "application/json" }, extra || {}),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) throw httpError(r.status === 401 || r.status === 403 ? 502 : r.status, (data && (data.msg || data.message || data.error_description || data.error)) || ("Supabase " + r.status));
  return data;
}
async function adminUser(req, env) {
  if (!env.SUPABASE_SERVICE_KEY) throw httpError(500, "서버에 SUPABASE_SERVICE_KEY 가 설정돼 있지 않아요");
  const token = (req.headers.get("Authorization") || "").slice(7);
  const r = await fetch(env.SUPABASE_URL + "/auth/v1/user", { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + token } });
  if (!r.ok) throw httpError(401, "로그인이 필요해요");
  const u = await r.json();
  const rows = await sb(env, "GET", "/rest/v1/dy_user_perms?user_id=eq." + enc(u.id) + "&select=is_admin,disabled");
  if (!rows || !rows[0] || !rows[0].is_admin || rows[0].disabled) throw httpError(403, "관리자만 쓸 수 있어요");
  return u;
}
// 권한 확인: 관리자·'*' 는 통과, 행이 없거나 사용 중지면 거부. 30초 캐시. 권한 표가 아직 없으면(DB 미설치) 통과(옛 동작)
const permCache = new Map();
async function needPerm(req, env, key) {
  if (!env.SUPABASE_SERVICE_KEY) return;
  const token = (req.headers.get("Authorization") || "").slice(7);
  let ent = permCache.get(token);
  if (!ent || ent.until < Date.now()) {
    const r = await fetch(env.SUPABASE_URL + "/auth/v1/user", { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + token } });
    if (!r.ok) throw httpError(401, "로그인이 필요해요");
    const u = await r.json();
    let row = null, open = false;
    try { const rows = await sb(env, "GET", "/rest/v1/dy_user_perms?user_id=eq." + enc(u.id) + "&select=is_admin,perms,disabled"); row = rows && rows[0]; }
    catch (e) { if (/dy_user_perms|relation|schema cache/i.test(String(e.message))) open = true; else throw e; }
    ent = { open, row, until: Date.now() + 30000 };
    if (permCache.size > 200) permCache.clear();
    permCache.set(token, ent);
  }
  if (ent.open) return;
  const p = ent.row;
  if (!p || p.disabled || !(p.is_admin || (p.perms || []).includes("*") || (p.perms || []).includes(key))) throw httpError(403, "이 기능을 쓸 권한이 없어요");
}
async function otherActiveAdmins(env, exceptId) {
  const rows = await sb(env, "GET", "/rest/v1/dy_user_perms?is_admin=eq.true&disabled=eq.false&select=user_id");
  return (rows || []).filter((x) => x.user_id !== exceptId).length;
}
async function adminApi(req, env, url) {
  const me = await adminUser(req, env), p = url.pathname;
  const body = req.method === "POST" || req.method === "PUT" ? await req.json().catch(() => ({})) : {};
  const m = /^\/api\/admin\/users\/([0-9a-f-]{36})(?:\/(password|disable))?$/.exec(p);
  if (p === "/api/admin/users" && req.method === "POST") {
    const login = String(body.login || "").trim(), pw = String(body.password || "");
    const email = login.includes("@") ? login : login + "@" + LOGIN_DOMAIN;
    if (!/^[A-Za-z0-9._+-]{2,40}(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?$/.test(login)) throw httpError(400, "아이디는 영문·숫자·._- 2~40자(또는 이메일)로 입력해 주세요");
    if (pw.length < 8 || pw.length > 72) throw httpError(400, "비밀번호는 8자 이상으로 입력해 주세요");
    const perms = Array.isArray(body.perms) ? body.perms.filter((x) => typeof x === "string" && x.length < 60).slice(0, 200) : [];
    const created = await sb(env, "POST", "/auth/v1/admin/users", { email, password: pw, email_confirm: true });
    try {
      await sb(env, "POST", "/rest/v1/dy_user_perms", { user_id: created.id, is_admin: !!body.is_admin, perms, display_name: String(body.name || "").trim().slice(0, 60) || null, note: String(body.note || "").trim().slice(0, 300) || null, updated_by: me.id },
        { Prefer: "resolution=merge-duplicates,return=minimal" });
    } catch (e) { await sb(env, "DELETE", "/auth/v1/admin/users/" + created.id).catch(() => {}); throw e; }
    return json({ ok: true, id: created.id, email });
  }
  if (m && m[2] === "password" && req.method === "POST") {
    const pw = String(body.password || "");
    if (pw.length < 8 || pw.length > 72) throw httpError(400, "비밀번호는 8자 이상으로 입력해 주세요");
    await sb(env, "PUT", "/auth/v1/admin/users/" + m[1], { password: pw });
    return json({ ok: true });
  }
  if (m && m[2] === "disable" && req.method === "POST") {
    const dis = !!body.disabled;
    if (dis && m[1] === me.id) throw httpError(400, "자기 자신은 사용 중지할 수 없어요");
    if (dis && (await otherActiveAdmins(env, m[1])) < 1) {
      const t = await sb(env, "GET", "/rest/v1/dy_user_perms?user_id=eq." + m[1] + "&select=is_admin");
      if (t && t[0] && t[0].is_admin) throw httpError(400, "마지막 관리자는 사용 중지할 수 없어요");
    }
    await sb(env, "PUT", "/auth/v1/admin/users/" + m[1], { ban_duration: dis ? "876000h" : "none" });
    await sb(env, "POST", "/rest/v1/dy_user_perms", { user_id: m[1], disabled: dis, updated_by: me.id }, { Prefer: "resolution=merge-duplicates,return=minimal" });
    return json({ ok: true });
  }
  if (m && !m[2] && req.method === "DELETE") {
    if (m[1] === me.id) throw httpError(400, "자기 자신은 삭제할 수 없어요");
    const t = await sb(env, "GET", "/rest/v1/dy_user_perms?user_id=eq." + m[1] + "&select=is_admin");
    if (t && t[0] && t[0].is_admin && (await otherActiveAdmins(env, m[1])) < 1) throw httpError(400, "마지막 관리자는 삭제할 수 없어요");
    await sb(env, "DELETE", "/auth/v1/admin/users/" + m[1]);
    return json({ ok: true });
  }
  throw httpError(404, "없는 요청이에요");
}

// ---------- 구글 시트 ----------
async function sheetMeta(env) {
  return gapi(env, "?fields=properties.title,sheets.properties(sheetId,title,gridProperties)");
}

async function prepare(env, name, rows, cols, header) {
  const meta = await sheetMeta(env);
  const s = (meta.sheets || []).map((x) => x.properties).find((x) => x.title === name);
  if (!s) {
    await gapi(env, ":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: name, gridProperties: { rowCount: rows, columnCount: cols } } } }] })
    });
    if (header) {
      await gapi(env, "values/" + enc(a1(name, "A1:" + colName(header.length) + "1")) + "?valueInputOption=RAW",
        { method: "PUT", body: JSON.stringify({ values: [header] }) });
    }
    return { created: true, rowCount: rows };
  }
  const g = s.gridProperties || {};
  const need = { rowCount: Math.max(g.rowCount || 0, rows), columnCount: Math.max(g.columnCount || 0, cols) };
  if (need.rowCount !== g.rowCount || need.columnCount !== g.columnCount) {
    await gapi(env, ":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: [{ updateSheetProperties: {
        properties: { sheetId: s.sheetId, gridProperties: need }, fields: "gridProperties.rowCount,gridProperties.columnCount" } }] })
    });
  }
  return { created: false, rowCount: need.rowCount };
}

async function gapi(env, path, init = {}) {
  const token = await googleToken(env);
  const headers = Object.assign({ Authorization: "Bearer " + token, "Content-Type": "application/json" }, init.headers || {});
  const r = await fetch(SHEETS_API + env.SHEET_ID + (path.startsWith("?") || path.startsWith(":") ? "" : "/") + path,
    Object.assign({}, init, { headers }));
  const text = await r.text();
  if (!r.ok) {
    let msg = text;
    try { msg = JSON.parse(text).error.message; } catch (_) {}
    throw httpError(r.status === 401 || r.status === 403 ? 502 : r.status, "구글 시트 오류 (" + r.status + "): " + String(msg).slice(0, 300));
  }
  return text ? JSON.parse(text) : {};
}

// 서비스 계정 JWT → 액세스 토큰 (1시간짜리, 메모리에 캐시)
let gtoken = null;
async function googleToken(env) {
  if (gtoken && gtoken.until > Date.now() + 60000) return gtoken.token;
  const sa = JSON.parse(env.GOOGLE_SA_JSON);
  const aud = sa.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud, iat: now, exp: now + 3600
  }));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + claim));
  const r = await fetch(aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + head + "." + claim + "." + b64url(sig)
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw httpError(502, "구글 인증 실패: " + (j.error_description || j.error || r.status));
  gtoken = { token: j.access_token, until: Date.now() + (j.expires_in || 3600) * 1000 };
  return gtoken.token;
}

// ---------- 도우미 ----------
function sheetName(n) {
  if (!SHEETS.has(n)) throw httpError(400, "쓸 수 없는 시트예요: " + n);
  return n;
}
function checkRange(r) {
  if (!RANGE_RE.test(r || "")) throw httpError(400, "범위가 올바르지 않아요");
  return r;
}
function a1(name, range) { return "'" + name + "'!" + range; }
function enc(s) { return encodeURIComponent(s); }
function colName(n) { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
function b64url(data) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToDer(pem) {
  const b = atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out.buffer;
}

// ---- 예약 작업 ----
async function runCron(cron, env, scheduledTime) {
  try {
    if (cron === "20 15 * * *") {
      const r = await collectRank(env, scheduledTime);
      console.log("랭킹 수집", JSON.stringify(r));
      if (r.failures.length) await alertFail(env, "랭킹 수집 실패: " + r.failures.map((f) => f.label + " — " + f.error).join(" / "));
    } else if (cron === "0 0 * * 1") {
      console.log("주간 리포트", JSON.stringify(await sendWeeklyReport(env, scheduledTime)));
    } else if (cron === "0 14 * * *") {
      const r = await collectEvent(env, scheduledTime);
      console.log("행사 랭킹 수집", JSON.stringify(r));
      if (r.failures.length) await alertFail(env, "행사 랭킹 수집 실패: " + r.failures.map((f) => f.label + " — " + f.error).join(" / "));
    } else {
      console.log("알 수 없는 cron", cron);
    }
  } catch (e) {
    console.log("cron 실패", cron, String((e && e.message) || e));
    await alertFail(env, String((e && e.message) || e));
  }
}

async function alertFail(env, msg) { // 실패를 메일로 알림 (메일 설정이 없으면 로그만)
  try { await sendResend(env, "⚠️ DY-AI 예약 작업 실패", "<p>" + msg.replace(/[<&]/g, "") + "</p>"); } catch (e) { console.log("알림 메일 실패", String(e)); }
}

async function manualCron(req, env, url) {
  const tok = req.headers.get("x-cron-token") || "";
  if (!env.CRON_TOKEN || tok !== env.CRON_TOKEN || req.method !== "POST") return json({ error: "forbidden" }, 403);
  const dry = url.searchParams.get("dry") === "1";
  if (url.pathname === "/api/cron/rank") return json(await collectRank(env, Date.now(), { dry, only: url.searchParams.get("only") || undefined }));
  if (url.pathname === "/api/cron/event") return json(await collectEvent(env, Date.now(), { dry, sid: url.searchParams.get("sid") || undefined, force: url.searchParams.get("force") === "1", probe: url.searchParams.get("probe") || undefined }));
  if (url.pathname === "/api/cron/report") return json(await sendWeeklyReport(env, Date.now(), { dry }));
  return json({ error: "not found" }, 404);
}
