/* DY-AI 메인: Q10 수집 결과를 원본 엑셀에 덮어쓰기
 *
 * 1) 수집 버튼을 누를 때 (사용자 동작 안에서) chooseTarget()
 *    - 처음: 원본 xlsx 를 고른다 → 파일 핸들을 IndexedDB 에 저장
 *    - 다음부터: "이 파일에 덮어쓸까요?" 확인 → 브라우저 수정 권한 요청
 *    - 또는 새 파일로 받기 / 취소
 * 2) 확장이 수집 결과를 넘기면 save(payload, target)
 *    - 원본을 읽어 raw_data / raw_trade / raw_conversion 만 교체 (xlsx-patch.js) 후 같은 파일에 저장
 *    - 엑셀에서 열려 있어 저장이 실패하면: [파일을 닫고 다시 시도] [새로운 파일로 저장] [취소]
 *      다시 시도해도 열려 있으면 같은 창을 계속 보여 준다.
 * 필요: dy.js(dyModal, dyToast), xlsx-writer.js(dyXlsx), xlsx-patch.js(dyXlsxPatch)
 */
(function () {
  "use strict";

  var DB = "dy-ai", STORE = "kv", KEY = "q10-xlsx-handle";
  var MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  var TYPES = [{ description: "Excel 통합 문서", accept: {} }];
  TYPES[0].accept[MIME] = [".xlsx"];
  var SHEETS = "raw_data · raw_trade · raw_conversion";

  var supported = "showOpenFilePicker" in window && "showSaveFilePicker" in window && "indexedDB" in window;

  // ---------- 파일 핸들 보관 (IndexedDB) ----------
  function idb(mode, fn) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () {
        var db = req.result, tx = db.transaction(STORE, mode), r = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { db.close(); resolve(r && r.result); };
        tx.onerror = tx.onabort = function () { db.close(); reject(tx.error); };
      };
    });
  }
  function getHandle() { return idb("readonly", function (s) { return s.get(KEY); }).catch(function () { return null; }); }
  function setHandle(h) { return idb("readwrite", function (s) { return s.put(h, KEY); }).catch(function () {}); }

  // ---------- 날짜 ----------
  function ymd(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }
  // 확장과 같은 기준: 어제 기준 전전월 1일
  function cutoffLabel() {
    var y = new Date(); y.setDate(y.getDate() - 1);
    return ymd(new Date(y.getFullYear(), y.getMonth() - 2, 1));
  }
  function stamp() {
    var n = new Date();
    return ymd(n).replace(/-/g, "") + "_" + String(n.getHours()).padStart(2, "0") + String(n.getMinutes()).padStart(2, "0");
  }

  // ---------- 파일 고르기 / 권한 ----------
  function pickOriginal() {
    return window.showOpenFilePicker({ id: "dy-q10", types: TYPES, multiple: false })
      .then(function (hs) { return hs[0]; })
      .catch(function (e) {
        if (e && e.name === "AbortError") return null;
        window.dyToast("파일을 열지 못했어요: " + (e && e.message || e), 5000);
        return null;
      });
  }

  // 사용자 동작(버튼 클릭) 안에서 불러야 브라우저가 허용 창을 띄울 수 있다
  function askWrite(h) {
    var o = { mode: "readwrite" };
    return h.queryPermission(o)
      .then(function (p) { return p === "granted" ? p : h.requestPermission(o); })
      .then(function (p) { return p === "granted"; })
      .catch(function () { return false; });
  }

  // ---------- 1) 저장 대상 고르기 ----------
  // → { mode: "file", handle } | { mode: "download" } | null(취소)
  async function chooseTarget() {
    if (!supported) return { mode: "download" };
    var h = await getHandle();
    var cut = cutoffLabel();

    for (;;) {
      var v;
      if (h) {
        v = await window.dyModal({
          tone: "file",
          title: "이 엑셀 파일에 덮어쓸까요?",
          body: [
            { file: h.name },
            SHEETS + " 시트에서 " + cut + " 이후 행만 새 데이터로 바꿔요. 그 전 행과 다른 시트·서식·수식은 그대로예요.",
            { note: "브라우저는 보안상 폴더 경로를 보여 주지 않아요. 처음 고른 바로 그 파일에 저장돼요." }
          ],
          actions: [
            { label: "이 파일에 저장", value: "use", kind: "primary" },
            { label: "다른 파일 고르기", value: "pick" },
            { label: "새 파일로 받기", value: "download" },
            { label: "취소", value: null, kind: "quiet" }
          ]
        });
      } else {
        v = await window.dyModal({
          tone: "file",
          title: "저장할 원본 엑셀을 골라 주세요",
          body: [
            "처음 한 번만 고르면 돼요. 다음부터는 같은 파일에 덮어쓸지 확인만 해요.",
            SHEETS + " 시트만 갈아 끼우고, 다른 시트는 그대로 둬요. (" + cut + " 이전 행은 유지)"
          ],
          actions: [
            { label: "원본 파일 고르기", value: "pick", kind: "primary" },
            { label: "새 파일로 받기", value: "download" },
            { label: "취소", value: null, kind: "quiet" }
          ]
        });
      }

      if (v === null) return null;
      if (v === "download") return { mode: "download" };
      if (v === "pick") {
        var picked = await pickOriginal();
        if (!picked) continue;
        h = picked;
        await setHandle(h);
        if (await askWrite(h)) return { mode: "file", handle: h };
        continue; // 허용을 못 받았으면 확인 창으로 (버튼을 누르면 다시 요청)
      }
      if (v === "use") {
        if (await askWrite(h)) return { mode: "file", handle: h };
        window.dyToast("파일 수정을 허용해야 그 파일에 저장할 수 있어요", 4000);
      }
    }
  }

  // ---------- 쓰기 ----------
  async function writeTo(h, bytes) {
    var w = await h.createWritable();
    try {
      await w.write(new Blob([bytes], { type: MIME }));
      await w.close(); // 임시 파일 → 원본 교체 (엑셀이 잡고 있으면 여기서 실패, 원본은 그대로)
    } catch (e) {
      try { await w.abort(); } catch (_) {}
      throw e;
    }
  }

  function download(bytes, filename) {
    var url = URL.createObjectURL(new Blob([bytes], { type: MIME }));
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  // 새 파일로 저장 (위치 고르기). 저장했으면 파일 이름, 취소했으면 null
  async function saveAs(bytes, suggested) {
    if (!("showSaveFilePicker" in window)) { download(bytes, suggested); return suggested + " (다운로드 폴더)"; }
    var h;
    try {
      h = await window.showSaveFilePicker({ id: "dy-q10", suggestedName: suggested, types: TYPES });
    } catch (e) {
      if (e && e.name === "AbortError") return null;
      throw e;
    }
    await writeTo(h, bytes);
    return h.name;
  }

  function freshBytes(p) {
    return window.dyXlsx.buildXlsx(p.sheets.map(function (s) { return { name: s.name, header: s.header, rows: s.rows }; }));
  }

  // ---------- 결과 안내 ----------
  function num(n) { return Number(n).toLocaleString("ko-KR"); }

  function summary(where, p, report, extra) {
    var parts = report
      ? report.map(function (r) { return r.name + (r.created ? " 새 시트 " : " 유지 " + num(r.kept) + " + 새로 ") + num(r.added) + "행"; })
      : p.sheets.map(function (s) { return s.name + " " + num(s.rows.length) + "행"; });
    var msg = where + " 저장 완료 (" + p.start + " ~ " + p.end + ") · " + parts.join(" · ");
    var warn = (p.warnings || []).concat(extra || []);
    if (warn.length) msg += " ⚠ " + warn.join(", ");
    window.dyToast(msg, 12000);
  }

  // 실패 종류별 확인 창
  function failModal(kind, name, err) {
    var detail = err && (err.message || err.name) ? String(err.message || err.name) : "";
    var c = {
      locked: {
        title: "파일이 열려 있어서 저장하지 못했어요",
        body: [{ file: name }, "엑셀(또는 다른 프로그램)에서 이 파일을 닫은 뒤 다시 시도해 주세요. 수집한 데이터는 그대로 가지고 있어요."],
        retry: "파일을 닫고 다시 시도"
      },
      perm: {
        title: "파일 수정 권한이 없어요",
        body: [{ file: name }, "다시 시도를 누르고 브라우저 창에서 ‘수정 허용’을 눌러 주세요."],
        retry: "허용하고 다시 시도"
      },
      missing: {
        title: "원본 파일을 찾을 수 없어요",
        body: [{ file: name }, "파일이 옮겨졌거나 이름이 바뀐 것 같아요. 파일을 다시 골라 주세요."],
        retry: "파일 다시 고르기"
      },
      format: {
        title: "이 파일에는 덮어쓸 수 없어요",
        body: [{ file: name }, detail || "엑셀 파일 형식을 읽지 못했어요."],
        retry: "다른 파일 고르기"
      }
    }[kind];
    if (kind === "locked" && detail) c.body.push({ note: "브라우저 메시지: " + detail });
    return window.dyModal({
      tone: "warn",
      title: c.title,
      body: c.body,
      actions: [
        { label: c.retry, value: "retry", kind: "primary" },
        { label: "새로운 파일로 저장", value: "new" },
        { label: "취소", value: null, kind: "quiet" }
      ]
    });
  }

  function classify(stage, e) {
    var n = e && e.name;
    if (n === "NotAllowedError" || n === "SecurityError") return "perm";
    if (n === "NotFoundError") return "missing";
    if (stage === "patch" || n === "FormatError") return "format";
    return "locked"; // NoModificationAllowedError / InvalidStateError / NotReadableError 등: 다른 프로그램이 잡고 있음
  }

  // ---------- 2) 저장 ----------
  // → true(저장됨) | false(취소)
  async function save(p, target) {
    if (!target || target.mode !== "file") {
      download(await freshBytes(p), p.filename);
      summary(p.filename + " (다운로드 폴더)", p, null);
      return true;
    }

    var h = target.handle;
    for (;;) {
      var stage = "read", merged = null, kind, err;
      try {
        var file = await h.getFile();
        var orig = new Uint8Array(await file.arrayBuffer());
        stage = "patch";
        merged = await window.dyXlsxPatch.patch(orig, p.sheets, p.cutoff);
        stage = "write";
        window.dyToast(h.name + " 에 저장하는 중…", 0);
        await writeTo(h, merged.bytes);
        summary(h.name, p, merged.report, merged.warnings);
        return true;
      } catch (e) {
        err = e;
        kind = classify(stage, e);
        console.warn("[DY-AI Q10] 저장 실패", stage, e);
      }

      window.dyToast("저장하지 못했어요. 창에서 어떻게 할지 골라 주세요.", 0);
      var v = await failModal(kind, h.name, err);

      if (v === null) {
        window.dyToast("저장을 취소했어요. 다시 저장하려면 Q10 수집을 다시 눌러 주세요.", 6000);
        return false;
      }

      if (v === "new") {
        var base = kind === "locked" || kind === "perm" ? h.name.replace(/\.xlsx$/i, "") + "_" + stamp() + ".xlsx" : p.filename;
        try {
          // 원본을 읽었으면 원본 + 새 데이터, 못 읽었으면 새 데이터만
          var bytes = merged ? merged.bytes : await freshBytes(p);
          var saved = await saveAs(bytes, base);
          if (saved) {
            summary(saved, p, merged && merged.report, merged ? merged.warnings : ["원본을 못 읽어서 새 데이터만 담았어요"]);
            return true;
          }
        } catch (e2) {
          window.dyToast("새 파일로도 저장하지 못했어요: " + (e2 && e2.message || e2), 6000);
        }
        continue; // 저장 위치 창을 닫았으면 다시 선택 창
      }

      // retry
      if (kind === "missing" || kind === "format") {
        var picked = await pickOriginal();
        if (picked) {
          h = picked;
          await setHandle(h);
        }
      }
      await askWrite(h); // 권한이 풀렸으면 다시 요청 (버튼 클릭 직후라 허용 창을 띄울 수 있음)
    }
  }

  window.dyQ10Save = { supported: supported, chooseTarget: chooseTarget, save: save };
})();
