/* Sell Thru 리포트 설정의 저장 단위 (SALES · PRODUCT · ONSITE AD)
 *   강조(표의 행·열·색)  → 기준월마다 하나  (inni_settings.fy 열에 YYYYMM 을 넣어 저장)
 *   그래프 설정(종류 등) → 리포트마다 하나, 기간·기준월과 무관  (fy = 0)
 *   옛 회계연도 값(fy = 2000~2100)은 새 값이 없을 때만 대신 읽는다 → 이미 저장해 둔 설정이 사라지지 않는다.
 *   설정 객체에서 {rows:[], cols:[]} 모양인 항목이 '강조', 나머지가 '그래프 설정'이다. 그래프 색상은 chart-colors.js 가 따로 저장한다.
 */
(function () {
  "use strict";
  var GLOBAL = 0;
  function ymKey(ym) { return Number(String(ym).slice(0, 4)) * 100 + Number(String(ym).slice(5, 7)); }
  function isSpec(v) { return !!v && typeof v === "object" && Array.isArray(v.rows) && Array.isArray(v.cols); }
  function split(cfg) {
    var hl = {}, ch = {};
    Object.keys(cfg || {}).forEach(function (k) { (isSpec(cfg[k]) ? hl : ch)[k] = cfg[k]; });
    return { hl: hl, ch: ch };
  }
  function one(rpc, report, key) { return rpc("dy_inni_settings_get", { p_report: report, p_fy: key }).catch(function () { return null; }); }

  // 화면에 쓸 설정 하나로 합쳐 돌려준다 (없으면 null)
  function get(rpc, report, ym, fy) {
    return Promise.all([one(rpc, report, ymKey(ym)), one(rpc, report, GLOBAL), one(rpc, report, fy)]).then(function (r) {
      var month = r[0], glob = r[1], legacy = r[2];
      if (!month && !glob && !legacy) return null;
      var hl = split(month || legacy).hl, ch = split(glob || legacy).ch, out = {};
      Object.keys(ch).forEach(function (k) { out[k] = ch[k]; });
      Object.keys(hl).forEach(function (k) { out[k] = hl[k]; });
      return out;
    });
  }

  // 바뀐 쪽만 저장: 강조는 그 기준월에, 그래프 설정은 전체에
  function set(rpc, report, ym, orig, draft) {
    var a = split(orig), b = split(draft), jobs = [];
    if (JSON.stringify(a.hl) !== JSON.stringify(b.hl)) jobs.push(rpc("dy_inni_settings_set", { p_report: report, p_fy: ymKey(ym), p_config: b.hl }));
    if (JSON.stringify(a.ch) !== JSON.stringify(b.ch)) jobs.push(rpc("dy_inni_settings_set", { p_report: report, p_fy: GLOBAL, p_config: b.ch }));
    return Promise.all(jobs);
  }

  window.dyInniCfg = { get: get, set: set, ymKey: ymKey, split: split };
})();
