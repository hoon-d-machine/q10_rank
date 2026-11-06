/* 기존 xlsx 의 시트 몇 개만 갈아 끼운다 (Qoo10_RPA.py 의 update_local_xlsx 와 같은 규칙)
 *   - 대상 시트: 기준일(cutoff) 이전 행은 원래 XML 그대로 유지, 이후는 새 데이터로 교체
 *   - 다른 시트·서식·수식·이름 정의는 손대지 않음 (zip 안의 그 시트 파일만 교체)
 *   - 대상 시트가 없으면 맨 뒤에 새로 만듦
 *   - calcChain 은 지우고 열 때 다시 계산하게 함 (다른 시트의 수식이 새 데이터를 반영하도록)
 *
 * 사용: const r = await dyXlsxPatch.patch(bytes, [{ name, header, rows, dateIdx }], "2026-09-01")
 *       r.bytes (Uint8Array), r.report [{ name, kept, added, created }], r.warnings [문자열]
 * 필요: xlsx-writer.js (self.dyXlsx)
 */
(function (root) {
  "use strict";

  var X = root.dyXlsx;
  var enc = new TextEncoder();
  var utf8 = new TextDecoder("utf-8");
  var latin1 = new TextDecoder("latin1");

  function FormatError(msg) { this.name = "FormatError"; this.message = msg; }
  FormatError.prototype = Object.create(Error.prototype);

  // ---------------------------------------------------------------- zip 읽기
  function readZip(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var eocd = -1;
    for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new FormatError("엑셀(xlsx) 파일이 아니에요");
    var count = dv.getUint16(eocd + 10, true);
    var cdOff = dv.getUint32(eocd + 16, true);
    if (count === 0xffff || cdOff === 0xffffffff) throw new FormatError("너무 큰 파일(zip64)은 지원하지 않아요");

    var entries = [], p = cdOff;
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new FormatError("파일이 손상됐어요 (zip 목록)");
      var flags = dv.getUint16(p + 8, true);
      var method = dv.getUint16(p + 10, true);
      var crc = dv.getUint32(p + 16, true);
      var csize = dv.getUint32(p + 20, true);
      var usize = dv.getUint32(p + 24, true);
      var nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      var nameBytes = bytes.slice(p + 46, p + 46 + nlen);
      if (flags & 1) throw new FormatError("암호가 걸린 파일은 열 수 없어요");
      if (dv.getUint32(lho, true) !== 0x04034b50) throw new FormatError("파일이 손상됐어요 (zip 항목)");
      var start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      entries.push({
        name: (flags & 0x0800 ? utf8 : latin1).decode(nameBytes),
        nameBytes: nameBytes, flags: flags, method: method, crc: crc, size: usize,
        data: bytes.subarray(start, start + csize)
      });
      p += 46 + nlen + xlen + clen;
    }
    return entries;
  }

  function inflateRaw(data) {
    var stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  function entryText(e) {
    if (e.method === 0) return Promise.resolve(utf8.decode(e.data));
    if (e.method === 8) return inflateRaw(e.data).then(function (b) { return utf8.decode(b); });
    return Promise.reject(new FormatError("지원하지 않는 압축 방식이에요 (" + e.method + ")"));
  }

  // ---------------------------------------------------------------- XML 도우미
  function unesc(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, function (_, k) {
      var l = k.toLowerCase();
      if (l === "lt") return "<"; if (l === "gt") return ">"; if (l === "amp") return "&";
      if (l === "quot") return '"'; if (l === "apos") return "'";
      return String.fromCodePoint(l[1] === "x" ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10));
    });
  }

  function attr(tag, name) {
    var m = tag.match(new RegExp("\\s" + name.replace(":", "\\:") + '\\s*=\\s*"([^"]*)"'));
    return m ? unesc(m[1]) : null;
  }

  function dirOf(path) { var i = path.lastIndexOf("/"); return i < 0 ? "" : path.slice(0, i + 1); }

  function resolvePath(base, target) {
    if (target.charAt(0) === "/") return target.slice(1);
    var parts = (base + target).split("/"), out = [];
    parts.forEach(function (s) { if (s === "..") out.pop(); else if (s !== "." && s !== "") out.push(s); });
    return out.join("/");
  }

  function relsPathFor(part) { return dirOf(part) + "_rels/" + part.slice(dirOf(part).length) + ".rels"; }

  function parseRels(xml) {
    var out = [];
    (xml.match(/<Relationship\b[^>]*>/g) || []).forEach(function (t) {
      out.push({ tag: t, id: attr(t, "Id"), type: attr(t, "Type") || "", target: attr(t, "Target") || "", mode: attr(t, "TargetMode") });
    });
    return out;
  }

  function relOfType(rels, suffix) {
    for (var i = 0; i < rels.length; i++) if (rels[i].type.slice(-suffix.length) === suffix) return rels[i];
    return null;
  }

  // 공유 문자열 (<rPh> 일본어 읽기 정보는 값이 아니므로 뺀다)
  function parseSst(xml) {
    var out = [];
    (xml.match(/<si\b[^>]*>[\s\S]*?<\/si>|<si\b[^>]*\/>/g) || []).forEach(function (si) {
      si = si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
      var t = "", m, re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
      while ((m = re.exec(si))) t += unesc(m[1]);
      out.push(t);
    });
    return out;
  }

  function colIndex(letters) {
    var n = 0;
    for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }

  // 엑셀 날짜 일련번호 → YYYY-MM-DD (날짜 열이 숫자로 바뀌어 저장돼 있을 때)
  function serialToYmd(n) {
    var d = new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000));
    return d.toISOString().slice(0, 10);
  }

  // 행 XML 에서 idx 번째 열 값 (문자열)
  function cellText(rowXml, idx, sst) {
    var re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, m, pos = -1;
    while ((m = re.exec(rowXml))) {
      var ref = (m[1].match(/\sr="([A-Z]+)\d+"/) || [])[1];
      pos = ref ? colIndex(ref) : pos + 1;
      if (pos < idx) continue;
      if (pos > idx) return null;
      var body = m[2] || "";
      var t = (m[1].match(/\st="([^"]*)"/) || [])[1] || "n";
      if (t === "inlineStr") {
        var s = "", mm, rt = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        while ((mm = rt.exec(body.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "")))) s += unesc(mm[1]);
        return s;
      }
      var v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      if (v == null) return null;
      v = unesc(v);
      if (t === "s") return sst[parseInt(v, 10)] == null ? null : sst[parseInt(v, 10)];
      if (t === "n") {
        var num = parseFloat(v);
        if (isFinite(num) && num >= 1 && num < 2958466) return serialToYmd(num);
      }
      return v;
    }
    return null;
  }

  // 유지할 행: 행/셀 번호를 새 위치로 옮긴다.
  // 수식: 같은 행을 가리키는 참조(=G11-H11 같은 것)는 새 행 번호로 바꾸고,
  //       공유/배열 수식은 옮기면 깨지므로 마지막 계산값만 남긴다 (stripped 로 알림)
  function renumberRow(rowXml, oldR, r, flag) {
    var open = rowXml.match(/^<row\b[^>]*?(\/?)>/)[0];
    var newOpen = /\sr="\d+"/.test(open) ? open.replace(/\sr="\d+"/, ' r="' + r + '"') : open.replace(/^<row\b/, '<row r="' + r + '"');
    var rest = rowXml.slice(open.length)
      .replace(/(<c\b[^>]*?\sr=")([A-Z]+)\d+(")/g, function (_, a, col, b) { return a + col + r + b; });
    if (oldR !== r && /<f\b/.test(rest)) {
      var same = new RegExp("(^|[^A-Za-z0-9_$!.:])(\\$?[A-Z]{1,3})" + oldR + "(?![0-9(])", "g");
      rest = rest.replace(/<f\b([^>]*)\/>|<f\b([^>]*)>([\s\S]*?)<\/f>/g, function (all, a1, a2, body) {
        var a = a1 != null ? a1 : a2;
        if (/\st="(shared|array|dataTable)"/.test(a) || body == null) { flag.stripped = true; return ""; }
        return "<f" + a + ">" + body.replace(same, function (_, pre, col) { return pre + col + r; }) + "</f>";
      });
    }
    return newOpen + rest;
  }

  // ---------------------------------------------------------------- 시트 교체
  function rebuildSheet(xml, ds, sst, cutoff, warnings) {
    var m = xml.match(/<sheetData\b[^>]*\/>|<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/);
    if (!m) throw new FormatError("'" + ds.name + "' 시트 형식을 읽지 못했어요");
    var rows = (m[1] || "").match(/<row\b[^>]*?\/>|<row\b[^>]*?>[\s\S]*?<\/row>/g) || [];

    var headerStyle = 0, kept = [], seq = 0, flag = { stripped: false };
    rows.forEach(function (row) {
      var rn = parseInt((row.match(/^<row\b[^>]*?\sr="(\d+)"/) || [])[1], 10);
      rn = isFinite(rn) ? rn : seq + 1;
      seq = rn;
      if (rn === 1) {
        var s = row.match(/<c\b[^>]*?\ss="(\d+)"/);
        if (s) headerStyle = parseInt(s[1], 10);
        return;
      }
      var d = cellText(row, ds.dateIdx, sst);
      if (d != null && d !== "" && String(d) < cutoff) kept.push({ xml: row, r: rn });
    });

    var out = [X.rowXml(1, ds.header, headerStyle)];
    kept.forEach(function (k, i) { out.push(renumberRow(k.xml, k.r, i + 2, flag)); });
    if (flag.stripped) warnings.push(ds.name + ": 옮겨진 행의 공유 수식은 값으로 바꿨어요");
    ds.rows.forEach(function (row, i) { out.push(X.rowXml(kept.length + i + 2, row, 0)); });

    var lastRow = kept.length + ds.rows.length + 1;
    var lastCol = X.colName(Math.max(ds.header.length, 1) - 1);
    var ref = "A1:" + lastCol + lastRow;

    var res = xml.slice(0, m.index) + "<sheetData>" + out.join("") + "</sheetData>" + xml.slice(m.index + m[0].length);
    res = res.replace(/(<dimension\b[^>]*\sref=")[^"]*(")/, "$1" + ref + "$2");
    res = res.replace(/(<autoFilter\b[^>]*\sref=")[^"]*(")/, "$1" + ref + "$2");
    if (/<tablePart\b/.test(res)) warnings.push(ds.name + ": 표(Table) 범위는 자동으로 안 바뀌어요");
    return { xml: res, kept: kept.length };
  }

  function newSheetXml(ds) { return X.sheetXml(ds.header, ds.rows, 0); }

  // ---------------------------------------------------------------- 본체
  async function patch(bytes, datasets, cutoff) {
    var entries = readZip(bytes);
    var byName = {};
    entries.forEach(function (e) { byName[e.name] = e; });
    async function text(name) { return byName[name] ? entryText(byName[name]) : null; }

    var changed = {};     // 이름 → 새 내용(문자열)
    var removed = {};
    var warnings = [], report = [];

    // 통합 문서 위치
    var rootRels = parseRels((await text("_rels/.rels")) || "");
    var docRel = relOfType(rootRels, "/officeDocument");
    var wbPath = docRel ? resolvePath("", docRel.target) : "xl/workbook.xml";
    var wb = await text(wbPath);
    if (!wb || !/<sheets\b/.test(wb)) throw new FormatError("엑셀 통합 문서(workbook)를 찾지 못했어요");
    var wbDir = dirOf(wbPath), wbRelsPath = relsPathFor(wbPath);
    var wbRelsXml = await text(wbRelsPath);
    if (!wbRelsXml) throw new FormatError("엑셀 시트 목록(rels)을 찾지 못했어요");
    var wbRels = parseRels(wbRelsXml);
    var ct = await text("[Content_Types].xml");
    if (!ct) throw new FormatError("엑셀 형식 정보([Content_Types])가 없어요");

    var sstRel = relOfType(wbRels, "/sharedStrings");
    var sst = sstRel ? parseSst((await text(resolvePath(wbDir, sstRel.target))) || "") : [];

    // 시트 목록
    var sheetTags = wb.match(/<sheet\b[^>]*>/g) || [];
    var rPrefix = ((sheetTags[0] || "").match(/\s(\w+):id="/) || [])[1] || "r";
    var sheets = sheetTags.map(function (t) {
      return { tag: t, name: attr(t, "name"), sheetId: parseInt(attr(t, "sheetId"), 10) || 0, rid: attr(t, rPrefix + ":id") };
    });

    for (var i = 0; i < datasets.length; i++) {
      var ds = datasets[i];
      var sh = null;
      sheets.forEach(function (s) { if (!sh && s.name === ds.name) sh = s; });
      sheets.forEach(function (s) { if (!sh && s.name && s.name.toLowerCase() === ds.name.toLowerCase()) sh = s; });

      if (sh) {
        var rel = null;
        wbRels.forEach(function (r) { if (r.id === sh.rid) rel = r; });
        if (!rel || !/\/worksheet$/.test(rel.type)) throw new FormatError("'" + ds.name + "' 은(는) 일반 시트가 아니에요 (차트 시트 등)");
        var path = resolvePath(wbDir, rel.target);
        var xml = await text(path);
        if (xml == null) throw new FormatError("'" + ds.name + "' 시트 파일이 없어요");
        var res = rebuildSheet(xml, ds, sst, cutoff, warnings);
        changed[path] = res.xml;
        report.push({ name: ds.name, kept: res.kept, added: ds.rows.length, created: false });
      } else {
        // 새 시트: 파일·관계·형식·목록에 추가
        var k = 1, newPath;
        do { newPath = wbDir + "worksheets/sheet" + k + ".xml"; k++; } while (byName[newPath] || changed[newPath]);
        var used = {}; wbRels.forEach(function (r) { used[r.id] = true; });
        var rid, j = 1; do { rid = "rId" + j++; } while (used[rid]);
        var maxId = sheets.reduce(function (a, s) { return Math.max(a, s.sheetId); }, 0);

        changed[newPath] = newSheetXml(ds);
        var relTag = '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="' +
          newPath.slice(wbDir.length) + '"/>';
        wbRelsXml = wbRelsXml.replace(/<\/Relationships>\s*$/, relTag + "</Relationships>");
        wbRels.push({ id: rid, type: "/worksheet", target: newPath.slice(wbDir.length) });
        ct = ct.replace(/<\/Types>\s*$/, '<Override PartName="/' + newPath + '" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
        var sheetTag = '<sheet name="' + X.esc(ds.name) + '" sheetId="' + (maxId + 1) + '" ' + rPrefix + ':id="' + rid + '"/>';
        wb = wb.replace(/<\/sheets>/, sheetTag + "</sheets>");
        sheets.push({ name: ds.name, sheetId: maxId + 1, rid: rid });
        report.push({ name: ds.name, kept: 0, added: ds.rows.length, created: true });
      }
    }

    // 계산 체인 삭제 + 열 때 전체 재계산
    var chainRel = relOfType(wbRels, "/calcChain");
    if (chainRel) {
      var chainPath = resolvePath(wbDir, chainRel.target);
      removed[chainPath] = true;
      wbRelsXml = wbRelsXml.replace(chainRel.tag, "");
      ct = ct.replace(new RegExp('<Override\\b[^>]*PartName="/' + chainPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"[^>]*/>'), "");
    }
    if (/<calcPr\b/.test(wb)) {
      wb = wb.replace(/<calcPr\b([^>]*?)(\/?)>/, function (all, a, slash) {
        a = a.replace(/\sfullCalcOnLoad="[^"]*"/, "");
        return "<calcPr" + a + ' fullCalcOnLoad="1"' + slash + ">";
      });
    } else {
      var at = wb.search(/<(oleSize|customWorkbookViews|pivotCaches|smartTagPr|smartTagTypes|webPublishing|fileRecoveryPr|webPublishObjects|extLst)\b|<\/workbook>/);
      wb = wb.slice(0, at) + '<calcPr fullCalcOnLoad="1"/>' + wb.slice(at);
    }
    changed[wbPath] = wb;
    changed[wbRelsPath] = wbRelsXml;
    changed["[Content_Types].xml"] = ct;

    // 피벗이 이 시트들을 원본으로 쓰면 알려 줌
    var names = datasets.map(function (d) { return d.name; });
    for (var e = 0; e < entries.length; e++) {
      if (!/pivotCacheDefinition\d*\.xml$/.test(entries[e].name)) continue;
      var pc = await entryText(entries[e]);
      var src = (pc.match(/<worksheetSource\b[^>]*>/) || [""])[0];
      var srcSheet = attr(src, "sheet");
      if (srcSheet && names.indexOf(srcSheet) >= 0) warnings.push(srcSheet + " 를 쓰는 피벗은 엑셀에서 '모두 새로 고침' 해 주세요");
    }

    // 다시 묶기: 바뀐 것만 새로 압축, 나머지는 압축된 바이트 그대로
    var out = [];
    for (var n = 0; n < entries.length; n++) {
      var en = entries[n];
      if (removed[en.name]) continue;
      if (en.name in changed) {
        var ne = await X.makeEntry(en.name, changed[en.name]);
        ne.nameBytes = en.nameBytes; ne.flags = en.flags & 0x0800; // 원래 이름 바이트·인코딩 그대로
        out.push(ne);
        delete changed[en.name];
      } else {
        out.push(en);
      }
    }
    for (var add in changed) out.push(await X.makeEntry(add, changed[add]));

    return { bytes: X.zipEntries(out), report: report, warnings: warnings };
  }

  root.dyXlsxPatch = { patch: patch, FormatError: FormatError, readZip: readZip };
  if (typeof module !== "undefined" && module.exports) module.exports = root.dyXlsxPatch;
})(typeof self !== "undefined" ? self : this);
