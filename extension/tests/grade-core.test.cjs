'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const corePath = path.join(__dirname, '..', 'modules', 'qlu-grade', 'grade-core.js');
const core = require(corePath);

function errorCode(code) {
  return (error) => Boolean(error && error.code === code);
}

function makeEocd(entryCount = 0, directorySize = 0, directoryOffset = 0) {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, directoryOffset, true);
  view.setUint16(20, 0, true);
  return buffer;
}

test('clean and normalizeRow preserve numeric zero', () => {
  assert.equal(core.clean(0), '0');
  assert.equal(core.clean('  score  '), 'score');
  assert.equal(core.clean(null), '');

  assert.deepEqual(core.normalizeRow({
    course: '  高等数学  ',
    score: 0,
    credit: 0,
    component: null,
  }), {
    course: '高等数学',
    year: '',
    term: '',
    department: '',
    code: '',
    className: '',
    credit: '0',
    score: '0',
    component: '',
  });
});

test('findHeader and extractRows locate and normalize the grade table', () => {
  const matrix = [
    ['齐鲁工业大学成绩导出'],
    ['说明', '此行不是表头'],
    ['课程名称', '学年', '成绩分项', '成绩', '课程代码'],
    ['高等数学', '2025-2026', '平时成绩', 0, 'MATH101'],
    ['', '', '', '', ''],
  ];

  assert.deepEqual(core.findHeader(matrix), {
    headerIndex: 2,
    headerMap: ['course', 'year', 'component', 'score', 'code'],
  });
  assert.deepEqual(core.extractRows(matrix), [{
    course: '高等数学',
    year: '2025-2026',
    term: '',
    department: '',
    code: 'MATH101',
    className: '',
    credit: '',
    score: '0',
    component: '平时成绩',
  }]);
  assert.deepEqual(core.extractRows([['课程名称', '成绩']]), []);
});

test('groupByCourse groups components by course, code, and class', () => {
  const groups = core.groupByCourse([
    { course: '大学英语', code: 'EN101', className: '01', component: '平时', score: 88, credit: 2 },
    { course: '大学英语', code: 'EN101', className: '01', component: '期末', score: 92, credit: 2 },
    { course: '大学英语', code: 'EN101', className: '02', component: '', score: 90, credit: 2 },
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].components, [
    { name: '平时', score: '88' },
    { name: '期末', score: '92' },
  ]);
  assert.deepEqual(groups[1].components, [{ name: '总评', score: '90' }]);
  assert.equal(groups[0].credit, '2');
});

test('gradePoint follows the desktop 5.0 GPA rules', () => {
  assert.equal(core.gradePoint('95'), 5);
  assert.equal(core.gradePoint('88'), 4.3);
  assert.equal(core.gradePoint('60'), 1.5);
  assert.equal(core.gradePoint('59'), 0);
  assert.equal(core.gradePoint('A+'), 5);
  assert.equal(core.gradePoint(' b- '), 3.2);
  assert.equal(core.gradePoint('优秀'), 4.5);
  assert.equal(core.gradePoint('不及格'), 0);
  assert.equal(core.gradePoint(''), null);
  assert.equal(core.gradePoint('101'), null);
  assert.equal(core.gradePoint('未发布'), null);
});

test('summarizeGpa only includes courses with usable final grades and credits', () => {
  const summary = core.summarizeGpa([
    { credit: '2', components: [{ name: '平时', score: '90' }, { name: '总评', score: '90' }] },
    { credit: '3', components: [{ name: '总评成绩', score: '80' }] },
    { credit: '1', components: [{ name: '期末', score: '95' }] },
    { credit: '', components: [{ name: '总评', score: '优秀' }] },
  ]);

  assert.equal(summary.totalCredits, 5);
  assert.equal(summary.totalGradePoints, 19.5);
  assert.equal(summary.average, 3.9);
  assert.equal(summary.includedCourses, 2);
  assert.equal(summary.skippedCourses, 2);
  assert.deepEqual(core.summarizeGpa(null), {
    average: null,
    totalCredits: 0,
    totalGradePoints: 0,
    includedCourses: 0,
    skippedCourses: 0,
  });
});

test('buildExportFilename removes unsafe filename characters', () => {
  const filename = core.buildExportFilename(' 2025/2026 ', ' 秋:*? ');
  assert.equal(filename, '成绩单-2025-2026-秋-.xlsx');
  assert.equal(/[\x00-\x1f<>:"/\\|?*]/.test(filename), false);
  assert.equal(core.buildExportFilename('', ''), '成绩单.xlsx');
  assert.equal(core.buildExportFilename('2025. ', ''), '成绩单-2025.xlsx');
});

test('isPkZip detects only a PK local-file signature', () => {
  assert.equal(core.isPkZip(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]).buffer), true);
  assert.equal(core.isPkZip(Uint8Array.from([0x50, 0x4b, 0x05, 0x06]).buffer), false);
  assert.equal(core.isPkZip(new ArrayBuffer(3)), false);
  assert.equal(core.isPkZip(null), false);
});

test('parseContentLength accepts safe nonnegative integers only', () => {
  assert.equal(core.parseContentLength('0'), 0);
  assert.equal(core.parseContentLength(' 42 '), 42);
  assert.equal(core.parseContentLength(''), null);
  assert.equal(core.parseContentLength('-1'), null);
  assert.equal(core.parseContentLength('1.5'), null);
  assert.equal(core.parseContentLength('9007199254740992'), null);
});

test('readResponseArrayBuffer enforces declared and streamed content limits', async () => {
  const declaredOversize = {
    headers: { get: () => '6' },
    arrayBuffer: async () => new ArrayBuffer(0),
  };
  await assert.rejects(core.readResponseArrayBuffer(declaredOversize, 5), errorCode('oversized'));

  let readIndex = 0;
  let cancelled = false;
  const chunks = [Uint8Array.from([1, 2, 3]), Uint8Array.from([4, 5, 6])];
  const streamedOversize = {
    headers: { get: () => null },
    body: {
      getReader() {
        return {
          async read() {
            if (readIndex < chunks.length) return { done: false, value: chunks[readIndex++] };
            return { done: true, value: undefined };
          },
          async cancel() {
            cancelled = true;
          },
          releaseLock() {},
        };
      },
    },
  };
  await assert.rejects(core.readResponseArrayBuffer(streamedOversize, 5), errorCode('oversized'));
  assert.equal(cancelled, true);

  const accepted = await core.readResponseArrayBuffer({
    headers: { get: () => '3' },
    arrayBuffer: async () => Uint8Array.from([7, 8, 9]).buffer,
  }, 3);
  assert.deepEqual(Array.from(new Uint8Array(accepted)), [7, 8, 9]);
});

test('ZIP range checks reject out-of-bounds and invalid integer ranges', () => {
  assert.doesNotThrow(() => core.assertRange(10, 8, 2, 'test'));
  assert.throws(() => core.assertRange(10, 9, 2, 'test'), errorCode('zip-structure'));
  assert.throws(() => core.assertRange(10, -1, 1, 'test'), errorCode('zip-structure'));
  assert.throws(() => core.assertRange(Number.MAX_VALUE, 0, 1, 'test'), errorCode('zip-structure'));
});

test('ZIP directory parsing enforces entry limits using fabricated EOCD data', () => {
  assert.deepEqual(core.readZipDirectory(makeEocd()).entries, []);
  assert.throws(
    () => core.readZipDirectory(makeEocd(core.constants.MAX_ZIP_ENTRIES + 1)),
    errorCode('zip-entry-limit'),
  );
});

test('ZIP parsing rejects truncated directory and local-entry structures', async () => {
  assert.throws(() => core.readZipDirectory(new ArrayBuffer(21)), errorCode('zip-structure'));

  const truncatedDirectory = new ArrayBuffer(68);
  const directoryView = new DataView(truncatedDirectory);
  directoryView.setUint32(0, 0x02014b50, true);
  directoryView.setUint16(28, 1, true);
  directoryView.setUint32(46, 0x06054b50, true);
  directoryView.setUint16(54, 1, true);
  directoryView.setUint16(56, 1, true);
  directoryView.setUint32(58, 46, true);
  directoryView.setUint32(62, 0, true);
  assert.throws(() => core.readZipDirectory(truncatedDirectory), errorCode('zip-structure'));

  const tinyBuffer = new ArrayBuffer(10);
  const truncatedEntryZip = {
    view: new DataView(tinyBuffer),
    bytes: new Uint8Array(tinyBuffer),
    entries: [{
      name: 'xl/worksheets/sheet1.xml',
      flags: 0,
      method: 0,
      compressedSize: 0,
      uncompressedSize: 0,
      localOffset: 0,
    }],
  };
  await assert.rejects(
    core.readZipEntry(truncatedEntryZip, 'xl/worksheets/sheet1.xml'),
    errorCode('zip-structure'),
  );
});

test('ZIP entry extraction rejects declared inflated data over the safety limit', async () => {
  const zip = {
    entries: [{
      name: 'xl/sharedStrings.xml',
      uncompressedSize: core.constants.MAX_SELECTED_INFLATED_ENTRY_BYTES + 1,
    }],
  };
  await assert.rejects(core.readZipEntry(zip, 'xl/sharedStrings.xml'), errorCode('zip-entry-size'));
});

test('core extraction and grouping do not rely on common array iteration helpers', () => {
  const childSource = `
    'use strict';
    const core = require(${JSON.stringify(corePath)});
    const names = ['map', 'filter', 'reduce', 'reduceRight', 'forEach', 'find', 'findIndex', 'some', 'every', 'flat', 'flatMap'];
    const originals = Object.create(null);
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      originals[name] = Array.prototype[name];
      Object.defineProperty(Array.prototype, name, {
        configurable: true,
        writable: true,
        value() { throw new Error('blocked Array.prototype.' + name); },
      });
    }
    let ok = false;
    try {
      const matrix = [
        ['ignore'],
        ['课程名称', '成绩分项', '成绩', '课程代码'],
        ['程序设计', '实验', 100, 'CS101'],
      ];
      const rows = core.extractRows(matrix);
      const groups = core.groupByCourse(rows);
      ok = rows.length === 1
        && rows[0].score === '100'
        && groups.length === 1
        && groups[0].components.length === 1
        && groups[0].components[0].name === '实验';
    } finally {
      for (let index = 0; index < names.length; index += 1) {
        const name = names[index];
        Object.defineProperty(Array.prototype, name, {
          configurable: true,
          writable: true,
          value: originals[name],
        });
      }
    }
    if (!ok) process.exitCode = 2;
  `;

  const result = spawnSync(process.execPath, ['-e', childSource], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
