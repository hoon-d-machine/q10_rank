/* honrye 저장소: Supabase 의 honrye_* 함수를 부른다 (공개 키 사용, 쓰기는 PIN 으로 보호됨)
 * 식순 화면(honrye.js)과 수정 페이지(edit.js)가 같이 쓴다.
 */
(function () {
  "use strict";
  var C = window.HONRYE_CFG || {};

  function rpc(name, args, timeout) {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctl && timeout ? setTimeout(function () { ctl.abort(); }, timeout) : null;
    function done() { if (timer) clearTimeout(timer); }
    return fetch(C.SUPABASE_URL + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: C.SUPABASE_KEY, Authorization: "Bearer " + C.SUPABASE_KEY },
      body: JSON.stringify(args || {}),
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok) {
          var e = new Error((j && (j.message || j.hint)) || ("HTTP " + r.status));
          e.status = r.status; e.code = j && j.code;
          throw e;
        }
        return j;
      });
    }).then(function (x) { done(); return x; }, function (e) { done(); throw e; });
  }

  function cacheKey(slug) { return "honrye.content." + slug; }

  window.HonryeStore = {
    slug: function () {
      var m = /[?&]c=([a-z0-9-]{1,40})/.exec(location.search);
      return m ? m[1] : (C.DEFAULT_SLUG || "main");
    },
    // 저장된 내용 읽기 → { rev, data } 또는 null (아직 저장된 게 없을 때)
    load: function (slug, timeout) {
      return rpc("honrye_get", { p_slug: slug }, timeout || 4000).then(function (r) { return r && r.data ? r : null; });
    },
    cacheGet: function (slug) {
      try { var v = JSON.parse(localStorage.getItem(cacheKey(slug))); return v && v.data ? v : null; } catch (e) { return null; }
    },
    cacheSet: function (slug, r) {
      try { localStorage.setItem(cacheKey(slug), JSON.stringify({ rev: r.rev, data: r.data })); } catch (e) {}
    },
    checkPin: function (pin) { return rpc("honrye_check_pin", { p_pin: pin }, 10000); },
    save: function (pin, data, slug, rev) {
      return rpc("honrye_save", { p_pin: pin, p_data: data, p_slug: slug, p_expected_rev: rev == null ? null : rev }, 20000);
    },
    setPin: function (oldPin, newPin) { return rpc("honrye_set_pin", { p_old: oldPin, p_new: newPin }, 10000); }
  };
})();
