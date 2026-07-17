(() => {
  'use strict';

  const GLOBAL_KEY = '__DODOKOLU_TOOLBOX_GRADE_CORE__';
  const EXPECTED_ORIGIN = 'https://jw.qlu.edu.cn';
  const EXPECTED_PATH_PREFIX = '/jwglxt/cjcx/';
  const GNMKDM = 'N305005';
  const EXPORT_PATH = '/jwglxt/cjcx/cjcx_dcXsKccjList.html';
  const HOST_ID = 'qlu-toolbox-grade-host';
  const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
  const MAX_ZIP_ENTRIES = 128;
  const MAX_SELECTED_INFLATED_ENTRY_BYTES = 50 * 1024 * 1024;
  const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
  const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
  const ZIP_END_SIGNATURE = 0x06054b50;
  const EXPORT_COLUMNS = [
    'kcmc@课程名称',
    'xnmmc@学年',
    'xqmmc@学期',
    'kkbmmc@开课学院',
    'kch@课程代码',
    'jxbmc@教学班',
    'xf@学分',
    'xmcj@成绩',
    'xmblmc@成绩分项',
  ];
  const HEADER_TO_KEY = Object.freeze({
    '课程名称': 'course',
    '学年': 'year',
    '学期': 'term',
    '开课学院': 'department',
    '课程代码': 'code',
    '教学班': 'className',
    '学分': 'credit',
    '成绩': 'score',
    '成绩分项': 'component',
  });
  const NORMALIZED_KEYS = Object.freeze([
    'course',
    'year',
    'term',
    'department',
    'code',
    'className',
    'credit',
    'score',
    'component',
  ]);
  const LETTER_GRADE_POINTS = Object.freeze({
    'A+': 5.0,
    A: 4.5,
    'A-': 4.2,
    'B+': 3.8,
    B: 3.5,
    'B-': 3.2,
    'C+': 2.8,
    C: 2.5,
    'C-': 2.2,
    D: 1.5,
    F: 0,
    '优秀': 4.5,
    '良好': 3.5,
    '中等': 2.5,
    '及格': 1.5,
    '不及格': 0,
  });

  function clean(value) {
    return value == null ? '' : String(value).trim();
  }

  function makeError(code, message) {
    const error = new Error(message || code || 'QLU grade error');
    error.code = code || 'error';
    return error;
  }

  function buildQueryBody(year, term) {
    const body = new URLSearchParams();
    body.set('gnmkdmKey', GNMKDM);
    body.set('xnm', clean(year));
    body.set('xqm', clean(term));
    body.set('dcclbh', 'JW_N305005_XSCXCJ');
    for (let index = 0; index < EXPORT_COLUMNS.length; index += 1) {
      body.append('exportModel.selectCol', EXPORT_COLUMNS[index]);
    }
    body.set('exportModel.exportWjgs', 'xls');
    body.set('fileName', '成绩单');
    return body;
  }

  function normalizeRow(source) {
    const row = {};
    for (let index = 0; index < NORMALIZED_KEYS.length; index += 1) {
      const key = NORMALIZED_KEYS[index];
      row[key] = clean(source && source[key]);
    }
    return row;
  }

  function findHeader(matrix) {
    const result = { headerIndex: -1, headerMap: [] };
    if (!Array.isArray(matrix)) return result;

    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
      const candidate = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
      const mapped = [];
      let recognized = 0;
      let hasCourse = false;
      let hasComponent = false;
      for (let columnIndex = 0; columnIndex < candidate.length; columnIndex += 1) {
        const key = HEADER_TO_KEY[clean(candidate[columnIndex])] || '';
        mapped.push(key);
        if (key) recognized += 1;
        if (key === 'course') hasCourse = true;
        if (key === 'component') hasComponent = true;
      }
      if (recognized >= 3 && hasCourse && hasComponent) {
        result.headerIndex = rowIndex;
        result.headerMap = mapped;
        return result;
      }
    }
    return result;
  }

  function extractRows(matrix) {
    if (!Array.isArray(matrix)) return [];
    const header = findHeader(matrix);
    if (header.headerIndex < 0) return [];

    const rows = [];
    for (let rowIndex = header.headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      const values = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
      const source = Object.create(null);
      for (let columnIndex = 0; columnIndex < header.headerMap.length; columnIndex += 1) {
        const key = header.headerMap[columnIndex];
        if (key) source[key] = values[columnIndex];
      }
      const row = normalizeRow(source);
      if (row.course || row.component || row.score) rows.push(row);
    }
    return rows;
  }

  function groupByCourse(rows) {
    const groups = [];
    const byKey = Object.create(null);
    if (!Array.isArray(rows)) return groups;

    for (let index = 0; index < rows.length; index += 1) {
      const row = normalizeRow(rows[index]);
      const key = `${row.course}\x00${row.code}\x00${row.className}`;
      let group = byKey[key];
      if (!group) {
        group = {
          course: row.course || '未命名课程',
          code: row.code,
          className: row.className,
          year: row.year,
          term: row.term,
          department: row.department,
          credit: row.credit,
          components: [],
        };
        byKey[key] = group;
        groups.push(group);
      }
      group.components.push({ name: row.component || '总评', score: row.score });
    }
    return groups;
  }

  function gradePoint(score) {
    const normalized = clean(score).replace(/\s+/g, '').toUpperCase();
    if (!normalized) return null;
    if (Object.prototype.hasOwnProperty.call(LETTER_GRADE_POINTS, normalized)) {
      return LETTER_GRADE_POINTS[normalized];
    }
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null;
    if (numeric >= 95) return 5;
    if (numeric >= 60) return Number((numeric / 10 - 4.5).toFixed(3));
    return 0;
  }

  function summarizeGpa(groups) {
    const summary = {
      average: null,
      totalCredits: 0,
      totalGradePoints: 0,
      includedCourses: 0,
      skippedCourses: 0,
    };
    if (!Array.isArray(groups)) return summary;

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex] || {};
      const credit = Number(clean(group.credit));
      const components = Array.isArray(group.components) ? group.components : [];
      let finalScore = '';
      for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
        const component = components[componentIndex] || {};
        const name = clean(component.name).replace(/\s+/g, '');
        if (name === '总评' || name === '总评成绩') finalScore = component.score;
      }
      const point = gradePoint(finalScore);
      if (!Number.isFinite(credit) || credit <= 0 || point === null) {
        summary.skippedCourses += 1;
        continue;
      }
      summary.totalCredits += credit;
      summary.totalGradePoints += credit * point;
      summary.includedCourses += 1;
    }
    if (summary.totalCredits > 0) {
      summary.average = summary.totalGradePoints / summary.totalCredits;
    }
    return summary;
  }

  function buildExportFilename(yearText, termText) {
    const parts = ['成绩单'];
    const year = clean(yearText);
    const term = clean(termText);
    if (year) parts.push(year);
    if (term) parts.push(term);
    const filename = parts
      .join('-')
      .replace(/[\x00-\x1f<>:"/\\|?*]/g, '-')
      .replace(/-+/g, '-')
      .replace(/[ .]+$/g, '')
      .trim();
    return `${filename || '成绩单'}.xlsx`;
  }

  function assertRange(totalLength, offset, length, label) {
    if (!Number.isSafeInteger(totalLength) || totalLength < 0) {
      throw makeError('zip-structure', 'Excel 文件长度无效');
    }
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) {
      throw makeError('zip-structure', `${label || 'Excel 数据'}位置无效`);
    }
    if (offset > totalLength || length > totalLength - offset) {
      throw makeError('zip-structure', `${label || 'Excel 数据'}超出文件范围`);
    }
  }

  function findEndOfCentralDirectory(view) {
    if (!(view instanceof DataView) || view.byteLength < 22) {
      throw makeError('zip-structure', 'Excel 文件结构不完整');
    }
    const minimum = Math.max(0, view.byteLength - 65557);
    for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
      if (view.getUint32(offset, true) !== ZIP_END_SIGNATURE) continue;
      const commentLength = view.getUint16(offset + 20, true);
      if (offset + 22 + commentLength === view.byteLength) return offset;
    }
    throw makeError('zip-structure', 'Excel 文件结构不完整');
  }

  function readZipDirectory(buffer) {
    if (!(buffer instanceof ArrayBuffer)) {
      throw makeError('zip-structure', 'Excel 数据不是有效的 ArrayBuffer');
    }
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder('utf-8');
    const eocd = findEndOfCentralDirectory(view);
    assertRange(view.byteLength, eocd, 22, 'Excel 目录结尾');

    const diskNumber = view.getUint16(eocd + 4, true);
    const directoryDisk = view.getUint16(eocd + 6, true);
    const diskEntryCount = view.getUint16(eocd + 8, true);
    const entryCount = view.getUint16(eocd + 10, true);
    const directorySize = view.getUint32(eocd + 12, true);
    const directoryOffset = view.getUint32(eocd + 16, true);
    if (diskNumber !== 0 || directoryDisk !== 0 || diskEntryCount !== entryCount) {
      throw makeError('zip-structure', '不支持分卷 Excel 文件');
    }
    if (entryCount > MAX_ZIP_ENTRIES) {
      throw makeError('zip-entry-limit', 'Excel 文件包含过多数据项');
    }
    assertRange(view.byteLength, directoryOffset, directorySize, 'Excel 中央目录');
    if (directoryOffset + directorySize > eocd) {
      throw makeError('zip-structure', 'Excel 中央目录长度无效');
    }

    const entries = [];
    let offset = directoryOffset;
    const directoryEnd = directoryOffset + directorySize;
    for (let index = 0; index < entryCount; index += 1) {
      assertRange(view.byteLength, offset, 46, 'Excel 目录项');
      if (offset + 46 > directoryEnd || view.getUint32(offset, true) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
        throw makeError('zip-structure', 'Excel 目录结构无法识别');
      }
      const flags = view.getUint16(offset + 8, true);
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const diskStart = view.getUint16(offset + 34, true);
      const localOffset = view.getUint32(offset + 42, true);
      const recordLength = 46 + nameLength + extraLength + commentLength;
      assertRange(view.byteLength, offset, recordLength, 'Excel 目录项');
      if (offset + recordLength > directoryEnd || diskStart !== 0) {
        throw makeError('zip-structure', 'Excel 目录项长度无效');
      }
      const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
      entries.push({ name, flags, method, compressedSize, uncompressedSize, localOffset });
      offset += recordLength;
    }
    if (offset !== directoryEnd) {
      throw makeError('zip-structure', 'Excel 中央目录边界无效');
    }
    return { view, bytes, entries };
  }

  function findZipEntry(zip, name) {
    if (!zip || !Array.isArray(zip.entries)) return null;
    for (let index = 0; index < zip.entries.length; index += 1) {
      const entry = zip.entries[index];
      if (entry && entry.name === name) return entry;
    }
    return null;
  }

  async function inflateRaw(bytes, expectedSize) {
    if (typeof DecompressionStream !== 'function') {
      throw makeError('unsupported-browser', '当前浏览器版本过旧，无法解析 Excel');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        const chunk = result.value instanceof Uint8Array ? result.value : new Uint8Array(result.value);
        total += chunk.byteLength;
        if (total > MAX_SELECTED_INFLATED_ENTRY_BYTES) {
          try {
            await reader.cancel();
          } catch (_error) {
            // The size error below is the useful failure.
          }
          throw makeError('zip-entry-size', 'Excel 数据块解压后过大');
        }
        chunks.push(chunk);
      }
    } finally {
      try {
        reader.releaseLock();
      } catch (_error) {
        // Ignore an already released/cancelled stream lock.
      }
    }
    if (Number.isSafeInteger(expectedSize) && expectedSize >= 0 && total !== expectedSize) {
      throw makeError('zip-structure', 'Excel 数据块解压长度不一致');
    }
    const output = new Uint8Array(total);
    let offset = 0;
    for (let index = 0; index < chunks.length; index += 1) {
      output.set(chunks[index], offset);
      offset += chunks[index].byteLength;
    }
    return output;
  }

  async function readZipEntry(zip, name) {
    const entry = findZipEntry(zip, name);
    if (!entry) return null;
    if (entry.uncompressedSize > MAX_SELECTED_INFLATED_ENTRY_BYTES) {
      throw makeError('zip-entry-size', 'Excel 数据块解压后过大');
    }
    if ((entry.flags & 0x0001) !== 0) {
      throw makeError('zip-encrypted', '不支持加密 Excel 文件');
    }

    const localOffset = entry.localOffset;
    assertRange(zip.view.byteLength, localOffset, 30, 'Excel 数据块头');
    if (zip.view.getUint32(localOffset, true) !== ZIP_LOCAL_FILE_SIGNATURE) {
      throw makeError('zip-structure', 'Excel 数据块无法识别');
    }
    const localFlags = zip.view.getUint16(localOffset + 6, true);
    const localMethod = zip.view.getUint16(localOffset + 8, true);
    const nameLength = zip.view.getUint16(localOffset + 26, true);
    const extraLength = zip.view.getUint16(localOffset + 28, true);
    const headerLength = 30 + nameLength + extraLength;
    assertRange(zip.view.byteLength, localOffset, headerLength, 'Excel 数据块头');
    const dataStart = localOffset + headerLength;
    assertRange(zip.view.byteLength, dataStart, entry.compressedSize, 'Excel 压缩数据');
    if ((localFlags & 0x0001) !== 0 || localMethod !== entry.method) {
      throw makeError('zip-structure', 'Excel 数据块信息不一致');
    }

    const compressed = zip.bytes.subarray(dataStart, dataStart + entry.compressedSize);
    if (entry.method === 0) {
      if (entry.compressedSize !== entry.uncompressedSize) {
        throw makeError('zip-structure', 'Excel 未压缩数据长度不一致');
      }
      return new Uint8Array(compressed);
    }
    if (entry.method === 8) return inflateRaw(compressed, entry.uncompressedSize);
    throw makeError('zip-compression', 'Excel 使用了暂不支持的压缩方式');
  }

  function parseXml(text, label) {
    if (typeof DOMParser !== 'function') {
      throw makeError('unsupported-browser', '当前环境无法解析 Excel XML');
    }
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) {
      throw makeError('xlsx-schema', `${label || 'Excel XML'}解析失败`);
    }
    return xml;
  }

  function combinedText(element) {
    let value = '';
    const textNodes = element.getElementsByTagName('t');
    for (let index = 0; index < textNodes.length; index += 1) {
      value += textNodes[index].textContent || '';
    }
    return value;
  }

  function cellColumnIndex(reference) {
    const normalized = clean(reference).toUpperCase();
    let column = 0;
    for (let index = 0; index < normalized.length; index += 1) {
      const code = normalized.charCodeAt(index);
      if (code < 65 || code > 90) break;
      column = column * 26 + code - 64;
      if (!Number.isSafeInteger(column)) return 0;
    }
    return Math.max(0, column - 1);
  }

  function sheetToMatrix(sheetXml, sharedStrings) {
    const matrix = [];
    const rowElements = sheetXml.getElementsByTagName('row');
    for (let rowElementIndex = 0; rowElementIndex < rowElements.length; rowElementIndex += 1) {
      const rowElement = rowElements[rowElementIndex];
      const rowNumber = Number.parseInt(rowElement.getAttribute('r') || '', 10);
      const rowIndex = Number.isFinite(rowNumber) && rowNumber > 0 ? rowNumber - 1 : matrix.length;
      const row = [];
      const cells = rowElement.getElementsByTagName('c');
      for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
        const cell = cells[cellIndex];
        const reference = cell.getAttribute('r') || 'A1';
        const columnIndex = cellColumnIndex(reference);
        const type = cell.getAttribute('t') || '';
        let value = '';
        if (type === 'inlineStr') {
          value = combinedText(cell);
        } else {
          const valueElements = cell.getElementsByTagName('v');
          const valueElement = valueElements.length ? valueElements[0] : null;
          const raw = valueElement ? valueElement.textContent || '' : '';
          if (type === 's') {
            const sharedIndex = Number.parseInt(raw, 10);
            value = Number.isSafeInteger(sharedIndex) && sharedIndex >= 0 ? sharedStrings[sharedIndex] || '' : '';
          } else if (type === 'b') {
            value = raw === '1' ? 'TRUE' : 'FALSE';
          } else {
            value = raw;
          }
        }
        row[columnIndex] = value;
      }
      matrix[rowIndex] = row;
    }
    return matrix;
  }

  async function parseXlsx(buffer) {
    if (!(buffer instanceof ArrayBuffer)) {
      throw makeError('xlsx-format', '成绩文件不是有效的二进制数据');
    }
    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      throw makeError('oversized', '成绩文件超过允许的大小');
    }
    const zip = readZipDirectory(buffer);
    const decoder = new TextDecoder('utf-8');
    const sharedStrings = [];
    const sharedBytes = await readZipEntry(zip, 'xl/sharedStrings.xml');
    if (sharedBytes) {
      const sharedXml = parseXml(decoder.decode(sharedBytes), 'Excel 文本');
      const items = sharedXml.getElementsByTagName('si');
      for (let index = 0; index < items.length; index += 1) {
        sharedStrings.push(combinedText(items[index]));
      }
    }

    let sheetName = 'xl/worksheets/sheet1.xml';
    if (!findZipEntry(zip, sheetName)) {
      sheetName = '';
      for (let index = 0; index < zip.entries.length; index += 1) {
        const name = zip.entries[index].name;
        if (name.startsWith('xl/worksheets/') && name.endsWith('.xml')) {
          sheetName = name;
          break;
        }
      }
    }
    if (!sheetName) throw makeError('xlsx-schema', 'Excel 中没有找到成绩工作表');
    const sheetBytes = await readZipEntry(zip, sheetName);
    if (!sheetBytes) throw makeError('xlsx-schema', 'Excel 中没有找到成绩工作表');
    const sheetXml = parseXml(decoder.decode(sheetBytes), '成绩工作表');
    return sheetToMatrix(sheetXml, sharedStrings);
  }

  function isPkZip(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 4) return false;
    const prefix = new Uint8Array(buffer, 0, 4);
    return prefix[0] === 0x50 && prefix[1] === 0x4b && prefix[2] === 0x03 && prefix[3] === 0x04;
  }

  function looksLikeHtml(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0) return false;
    const length = Math.min(buffer.byteLength, 1024);
    const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer, 0, length));
    const normalized = text.replace(/^﻿/, '').trimStart().toLowerCase();
    return normalized.startsWith('<!doctype html') || normalized.startsWith('<html') || normalized.startsWith('<head') || normalized.startsWith('<body');
  }

  function parseContentLength(value) {
    const normalized = clean(value);
    if (!/^\d+$/.test(normalized)) return null;
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  async function readResponseArrayBuffer(response, maximumBytes) {
    const limit = Number.isSafeInteger(maximumBytes) && maximumBytes >= 0 ? maximumBytes : MAX_RESPONSE_BYTES;
    const declaredLength = parseContentLength(response && response.headers ? response.headers.get('content-length') : null);
    if (declaredLength !== null && declaredLength > limit) {
      throw makeError('oversized', '成绩文件超过允许的大小');
    }

    if (!response || !response.body || typeof response.body.getReader !== 'function') {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > limit) throw makeError('oversized', '成绩文件超过允许的大小');
      return buffer;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        const chunk = result.value instanceof Uint8Array ? result.value : new Uint8Array(result.value);
        total += chunk.byteLength;
        if (total > limit) {
          try {
            await reader.cancel();
          } catch (_error) {
            // Preserve the deterministic size error below.
          }
          throw makeError('oversized', '成绩文件超过允许的大小');
        }
        chunks.push(chunk);
      }
    } finally {
      try {
        reader.releaseLock();
      } catch (_error) {
        // Ignore an already released/cancelled stream lock.
      }
    }

    const output = new Uint8Array(total);
    let offset = 0;
    for (let index = 0; index < chunks.length; index += 1) {
      output.set(chunks[index], offset);
      offset += chunks[index].byteLength;
    }
    return output.buffer;
  }

  const constants = Object.freeze({
    GLOBAL_KEY,
    EXPECTED_ORIGIN,
    EXPECTED_PATH_PREFIX,
    GNMKDM,
    EXPORT_PATH,
    HOST_ID,
    MAX_RESPONSE_BYTES,
    MAX_ZIP_ENTRIES,
    MAX_SELECTED_INFLATED_ENTRY_BYTES,
    EXPORT_COLUMNS,
    HEADER_TO_KEY,
    NORMALIZED_KEYS,
  });

  const api = Object.freeze({
    constants,
    clean,
    makeError,
    buildQueryBody,
    normalizeRow,
    findHeader,
    extractRows,
    groupByCourse,
    gradePoint,
    summarizeGpa,
    buildExportFilename,
    assertRange,
    findEndOfCentralDirectory,
    readZipDirectory,
    findZipEntry,
    inflateRaw,
    readZipEntry,
    parseXml,
    combinedText,
    cellColumnIndex,
    sheetToMatrix,
    parseXlsx,
    isPkZip,
    looksLikeHtml,
    parseContentLength,
    readResponseArrayBuffer,
  });

  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  } else {
    Object.defineProperty(globalThis, GLOBAL_KEY, {
      value: api,
      configurable: true,
      enumerable: false,
      writable: false,
    });
  }
})();
