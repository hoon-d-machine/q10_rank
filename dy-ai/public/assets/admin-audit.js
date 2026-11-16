/* 변경 이력 (관리 화면 아래 섹션): 편집 가능한 표(상품코드·코멘트·설정·목표·광고비·대시보드·즐겨찾기·행사 설정·계정 권한)의 입력·수정·삭제 기록과 되돌리기
 *   DB: dy_audit_list / dy_audit_rollback (supabase/audit.sql, 관리자만). 기록은 표에 건 트리거가 남겨서 어느 화면에서 저장해도 빠지지 않는다.
 */
(function () {
  "use strict";
  var A = window.dyAuth, P = window.dyPerm;
  var root = document.querySelector(".js-audit");
  if (!root || !A) return;
  var $ = function (s) { return root.querySelector(s); };
  var PAGE = 50, items = [], oldest = null, more = false;

  var TABLES = { inni_product_codes: "상품코드", inni_comments: "코멘트", inni_settings: "보고서 설정", inni_targets: "월별 목표", inni_ad_manual: "광고비(수기)",
    dy_dashboards: "대시보드", brand_favorites: "브랜드 즐겨찾기", dy_event_config: "행사 랭킹 설정", dy_user_perms: "계정 권한" };
  var OPS = { I: "입력", U: "수정", D: "삭제" };
  var SKIP = { updated_at: 1, updated_by: 1, created_at: 1 };

  function h(tag, c, text) { var e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; }
  function toast(m) { if (window.dyToast) window.dyToast(m, 4000); }
  function msg(t) { var m = $(".js-a-msg"); m.textContent = t || ""; m.hidden = !t; }
  function when(t) { var d = new Date(t); return isNaN(d) ? "-" : (d.getMonth() + 1) + "-" + ("0" + d.getDate()).slice(-2) + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ":" + ("0" + d.getSeconds()).slice(-2); }
  function rpc(name, args) { return A.client.rpc(name, args || {}).then(function (r) { if (r.error) throw new Error(r.error.message); return r.data; }); }
  function cut(v, n) { var s = v == null ? "∅" : (typeof v === "object" ? JSON.stringify(v) : String(v)); s = s.replace(/\s+/g, " "); return s.length > n ? s.slice(0, n) + "…" : s; }

  function target(it) { return Object.keys(it.pk || {}).map(function (k) { return cut(it.pk[k], 28); }).join(" · ") || "-"; }
  function changes(it) { // 사람이 읽는 변경 내용
    var o = it.old_row || {}, n = it.new_row || {}, out = [];
    if (it.op === "U") {
      Object.keys(n).forEach(function (k) {
        if (SKIP[k] || JSON.stringify(o[k]) === JSON.stringify(n[k])) return;
        out.push(k + ": " + cut(o[k], 40) + " → " + cut(n[k], 40));
      });
    } else {
      var row = it.op === "I" ? n : o;
      Object.keys(row).forEach(function (k) { if (!SKIP[k] && row[k] != null && row[k] !== "" && row[k] !== false && !(it.pk && k in it.pk)) out.push(k + ": " + cut(row[k], 40)); });
    }
    return out.slice(0, 6).join("\n") || "(내용 없음)";
  }

  function render() {
    var body = $(".js-a-rows"); body.innerHTML = "";
    if (!items.length) { var tr = h("tr"), td = h("td", "admin-empty", "조건에 맞는 변경 이력이 없어요"); td.colSpan = 7; tr.appendChild(td); body.appendChild(tr); }
    items.forEach(function (it) {
      var tr = h("tr", it.rolled_back ? "is-rolled" : "");
      var cb = h("input"); cb.type = "checkbox"; cb.dataset.id = it.id; cb.disabled = !!it.rolled_back;
      var c0 = h("td"); c0.appendChild(cb); tr.appendChild(c0);
      tr.appendChild(h("td", "", when(it.ts)));
      tr.appendChild(h("td", "", it.user_email || "시스템"));
      tr.appendChild(h("td", "", TABLES[it.tbl] || it.tbl));
      var op = h("td"); op.appendChild(h("span", "audit-op audit-op-" + it.op, it.via === "rollback" ? "되돌림·" + OPS[it.op] : OPS[it.op])); tr.appendChild(op);
      tr.appendChild(h("td", "", target(it)));
      var ch = h("td", "audit-changes"); ch.textContent = changes(it) + (it.rolled_back ? "\n(되돌려짐)" : ""); tr.appendChild(ch);
      body.appendChild(tr);
    });
    $(".js-a-more").hidden = !more;
    $(".js-a-count").textContent = items.length + "건 표시";
  }

  function load(append) {
    var args = { p_limit: PAGE + 1, p_tbl: $(".js-a-tbl").value || null, p_user: $(".js-a-user").value.trim() || null };
    var f = $(".js-a-from").value, t = $(".js-a-to").value;
    if (f) args.p_from = new Date(f + "T00:00:00").toISOString();
    if (t) args.p_to = new Date(new Date(t + "T00:00:00").getTime() + 86400000).toISOString();
    if (append && oldest != null) args.p_before = oldest;
    msg("");
    return rpc("dy_audit_list", args).then(function (rows) {
      more = rows.length > PAGE; rows = rows.slice(0, PAGE);
      items = append ? items.concat(rows) : rows;
      oldest = items.length ? items[items.length - 1].id : null;
      render();
    }).catch(function (e) { msg(/function|PGRST202/i.test(e.message) ? "변경 이력 기능이 아직 서버(DB)에 설치되지 않았어요 (supabase/audit.sql 실행 필요)" : e.message); });
  }

  function selected() { return Array.prototype.map.call(root.querySelectorAll(".js-a-rows input:checked"), function (c) { return Number(c.dataset.id); }); }

  function rollback(ids, force) {
    return rpc("dy_audit_rollback", { p_ids: ids, p_force: !!force }).then(function (r) {
      var skipped = r.skipped || [];
      toast(r.done + "건을 되돌렸어요" + (skipped.length ? " · " + skipped.length + "건은 건너뜀" : ""));
      return load(false).then(function () {
        if (!skipped.length) return;
        var ids2 = skipped.map(function (s) { return s.id; });
        return window.dyModal({ tone: "warn", title: skipped.length + "건은 되돌리지 못했어요",
          body: [skipped.slice(0, 5).map(function (s) { return "#" + s.id + " " + s.reason; }).join("\n"),
                 { note: "그 뒤에 더 최근 변경이 있는 행이에요. 최근 변경부터 되돌리는 게 안전해요. 지금 값을 무시하고 이 이력 이전 값으로 덮어쓸 수도 있어요." }],
          actions: [{ label: "강제로 덮어쓰기", value: "force", kind: "primary" }, { label: "그만두기", value: null, kind: "quiet" }] })
          .then(function (v) { if (v === "force") return rollback(ids2, true); });
      });
    }).catch(function (e) { msg("되돌리지 못했어요: " + e.message); });
  }

  function ask(ids) {
    if (!ids.length) { toast("되돌릴 항목을 선택하세요"); return; }
    window.dyModal({ tone: "warn", title: ids.length + "건을 되돌릴까요?",
      body: ["선택한 변경을 이전 값으로 되돌려요. 입력은 삭제되고, 수정은 이전 값으로, 삭제는 다시 만들어져요.", { note: "되돌린 것도 이력에 남고, 다시 되돌릴 수 있어요." }],
      actions: [{ label: "되돌리기", value: "ok", kind: "primary" }, { label: "취소", value: null, kind: "quiet" }] }).then(function (v) { if (v === "ok") rollback(ids, false); });
  }

  // ---------- 화면 만들기 ----------
  var sel = $(".js-a-tbl");
  sel.appendChild(h("option", "", "모든 표")).value = "";
  Object.keys(TABLES).forEach(function (k) { var o = h("option", "", TABLES[k]); o.value = k; sel.appendChild(o); });
  $(".js-a-refresh").addEventListener("click", function () { load(false); });
  $(".js-a-more").addEventListener("click", function () { load(true); });
  $(".js-a-do").addEventListener("click", function () { ask(selected()); });
  $(".js-a-all").addEventListener("change", function (e) { Array.prototype.forEach.call(root.querySelectorAll(".js-a-rows input[type=checkbox]:not(:disabled)"), function (c) { c.checked = e.target.checked; }); });
  ["js-a-tbl", "js-a-from", "js-a-to"].forEach(function (c) { $("." + c).addEventListener("change", function () { load(false); }); });
  $(".js-a-user").addEventListener("keydown", function (e) { if (e.key === "Enter") load(false); });

  (P ? P.ready : Promise.resolve()).then(function () { if (P && P.isAdmin()) load(false); else root.hidden = true; });
})();
