/* 의존성 없는 최소 xlsx 생성기 (시트 여러 개, 문자열/숫자, 첫 행 고정 + 굵게)
 * 사용: const bytes = await buildXlsx([{ name, header: [...], rows: [[...], ...] }, ...])  → Uint8Array
 * zip은 CompressionStream(deflate)으로 압축하고, 없는 환경이면 무압축으로 만든다.
 *
 * 원본: dy-ai/extension/xlsx-writer.js
 * dy-ai/public/assets/xlsx-writer.js 는 build_extension.py 가 복사한 사본 (사이트의 원본 파일 덮어쓰기용). 사본은 고치지 말 것.
 * 다른 스크립트(xlsx-patch.js)가 쓰도록 내부 도구를 self.dyXlsx 로도 내보낸다.
 */
(function (root) {
  "use strict";

  var enc = new TextEncoder();

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      // XML 1.0에서 허용되지 않는 제어문자 제거
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");
  }

  function colName(i) {
    var s = "";
    i += 1;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  function cell(ref, v, style) {
    var st = style ? ' s="' + style + '"' : "";
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "number" && isFinite(v)) return '<c r="' + ref + '"' + st + '><v>' + v + "</v></c>";
    if (typeof v === "boolean") return '<c r="' + ref + '"' + st + ' t="b"><v>' + (v ? 1 : 0) + "</v></c>";
    return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + "</t></is></c>";
  }

  // headerStyle: 머리글 셀 스타일 번호 (새 파일은 1 = 굵게, 기존 파일에 끼울 때는 그 파일의 번호)
  function rowXml(r, row, style) {
    var cells = "";
    for (var c = 0; c < row.length; c++) cells += cell(colName(c) + r, row[c], style);
    return '<row r="' + r + '">' + cells + "</row>";
  }

  function sheetXml(header, rows, headerStyle) {
    if (headerStyle === undefined) headerStyle = 1;
    var out = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
      "<sheetData>"
    ];
    var all = [header].concat(rows);
    for (var r = 0; r < all.length; r++) out.push(rowXml(r + 1, all[r] || [], r === 0 ? headerStyle : 0));
    out.push("</sheetData></worksheet>");
    return out.join("");
  }

  function safeSheetName(n, used) {
    var s = String(n || "Sheet").replace(/[\\\/\?\*\[\]:]/g, "_").slice(0, 31) || "Sheet";
    var base = s, k = 2;
    while (used[s.toLowerCase()]) { s = base.slice(0, 28) + "_" + k++; }
    used[s.toLowerCase()] = true;
    return s;
  }

  // ---- zip (stored) ----
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // entries: [{ nameBytes, flags, method, crc, size(원래 크기), data(저장할 바이트) }]
  // 기존 zip에서 옮겨 오는 항목은 압축된 바이트를 그대로 다시 넣는다.
  function zipEntries(entries) {
    var parts = [], central = [], offset = 0;
    var d = new Date();
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

    entries.forEach(function (f) {
      var name = f.nameBytes, data = f.data;
      var flags = (f.flags == null ? 0x0800 : f.flags) & ~0x0008; // 데이터 디스크립터 없이 헤더에 크기 기록

      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, flags, true);           // 0x0800 = UTF-8 파일명
      lh.setUint16(8, f.method, true);        // 0 = stored, 8 = deflate
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, f.crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, f.size, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);

      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, flags, true);
      ch.setUint16(10, f.method, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, f.crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, f.size, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);

      offset += 30 + name.length + data.length;
    });

    var centralSize = central.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    var all = parts.concat(central, [new Uint8Array(end.buffer)]);
    var total = all.reduce(function (s, p) { return s + p.length; }, 0);
    var out = new Uint8Array(total), pos = 0;
    all.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  function deflateRaw(bytes) {
    var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  // 이름 + 내용(문자열 또는 Uint8Array) → zip 항목 (CompressionStream 있으면 압축, 없으면 무압축)
  function makeEntry(name, content) {
    var raw = typeof content === "string" ? enc.encode(content) : content;
    var e = { nameBytes: enc.encode(name), flags: 0x0800, method: 0, crc: crc32(raw), size: raw.length, data: raw };
    if (typeof CompressionStream === "undefined") return Promise.resolve(e);
    return deflateRaw(raw).then(function (c) { e.method = 8; e.data = c; return e; });
  }

  function packFiles(files) {
    return Promise.all(files.map(function (f) { return makeEntry(f.name, f.data); })).then(zipEntries);
  }

  // → Promise<Uint8Array>
  function buildXlsx(sheets) {
    var used = {};
    var names = sheets.map(function (s) { return safeSheetName(s.name, used); });
    var files = [
      { name: "[Content_Types].xml", data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        names.map(function (_, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join("") +
        "</Types>" },
      { name: "_rels/.rels", data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>" },
      { name: "xl/workbook.xml", data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map(function (n, i) { return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") +
        "</sheets></workbook>" },
      { name: "xl/_rels/workbook.xml.rels", data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        names.map(function (_, i) {
          return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
        }).join("") +
        '<Relationship Id="rId' + (names.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>" },
      { name: "xl/styles.xml", data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        "</styleSheet>" }
    ];
    sheets.forEach(function (s, i) {
      files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: sheetXml(s.header || [], s.rows || []) });
    });
    return packFiles(files);
  }

  root.buildXlsx = buildXlsx;
  root.dyXlsx = {
    buildXlsx: buildXlsx, sheetXml: sheetXml, rowXml: rowXml, cell: cell, esc: esc, colName: colName,
    crc32: crc32, deflateRaw: deflateRaw, makeEntry: makeEntry, zipEntries: zipEntries
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.dyXlsx;
})(typeof self !== "undefined" ? self : this);
