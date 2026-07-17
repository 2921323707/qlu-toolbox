import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function importActualModule(relativePath) {
  const fileUrl = new URL(relativePath, import.meta.url);
  const source = await readFile(fileUrl, 'utf8');
  const encoded = Buffer.from(source).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

const registry = await importActualModule('../core/module-registry.js');
const matcher = await importActualModule('../core/url-match.js');
const qluGrade = registry.getModuleById('qlu-grade');
const exactQluUrl = 'https://jw.qlu.edu.cn/jwglxt/cjcx/cjcx_cxDgXscj.html?gnmkdm=N305005';

function reasonFor(url, module = qluGrade) {
  return matcher.evaluateUrlEligibility(module, url).reason;
}

test('accepts the exact supported QLU grade URL', () => {
  assert.ok(qluGrade);
  assert.deepEqual(matcher.evaluateUrlEligibility(qluGrade, exactQluUrl), {
    eligible: true,
    reason: matcher.ELIGIBILITY_REASONS.ELIGIBLE,
  });
});

test('accepts harmless extra query parameters and a fragment', () => {
  const url = `${exactQluUrl}&layout=default&display=compact#grade-table`;
  assert.equal(reasonFor(url), matcher.ELIGIBILITY_REASONS.ELIGIBLE);
});

test('rejects missing, wrong, and duplicate gnmkdm values', () => {
  const base = 'https://jw.qlu.edu.cn/jwglxt/cjcx/cjcx_cxDgXscj.html';
  assert.equal(reasonFor(base), matcher.ELIGIBILITY_REASONS.QUERY_MISMATCH);
  assert.equal(reasonFor(`${base}?gnmkdm=N305006`), matcher.ELIGIBILITY_REASONS.QUERY_MISMATCH);
  assert.equal(
    reasonFor(`${base}?gnmkdm=N305005&gnmkdm=N305005`),
    matcher.ELIGIBILITY_REASONS.QUERY_MISMATCH,
  );
});

test('requires HTTPS and the exact QLU origin', () => {
  assert.equal(
    reasonFor('http://jw.qlu.edu.cn/jwglxt/cjcx/cjcx_cxDgXscj.html?gnmkdm=N305005'),
    matcher.ELIGIBILITY_REASONS.HTTPS_REQUIRED,
  );
  assert.equal(
    reasonFor('https://jw.qlu.edu.cn.evil.example/jwglxt/cjcx/cjcx_cxDgXscj.html?gnmkdm=N305005'),
    matcher.ELIGIBILITY_REASONS.ORIGIN_MISMATCH,
  );
});

test('requires a complete path segment prefix', () => {
  assert.equal(
    reasonFor('https://jw.qlu.edu.cn/jwglxt/cjcx-evil/cjcx_cxDgXscj.html?gnmkdm=N305005'),
    matcher.ELIGIBILITY_REASONS.PATH_MISMATCH,
  );
});

test('classifies restricted and invalid internal URLs safely', () => {
  assert.equal(reasonFor('chrome://extensions/'), matcher.ELIGIBILITY_REASONS.RESTRICTED_URL);
  assert.equal(reasonFor('about:blank'), matcher.ELIGIBILITY_REASONS.RESTRICTED_URL);
  assert.equal(reasonFor('not a url'), matcher.ELIGIBILITY_REASONS.INVALID_URL);
  assert.equal(matcher.isRestrictedEligibilityReason(matcher.ELIGIBILITY_REASONS.RESTRICTED_URL), true);
  assert.equal(matcher.isRestrictedEligibilityReason(matcher.ELIGIBILITY_REASONS.INVALID_URL), true);
});

test('returns null for unknown modules and rejects invalid module metadata', () => {
  assert.equal(registry.getModuleById('unknown-module'), null);
  assert.equal(registry.getModuleById(null), null);
  assert.equal(registry.hasModule('unknown-module'), false);
  assert.equal(reasonFor(exactQluUrl, null), matcher.ELIGIBILITY_REASONS.INVALID_MODULE);
});

test('keeps registry metadata frozen', () => {
  assert.equal(registry.getModules(), registry.MODULES);
  assert.equal(Object.isFrozen(registry.MODULES), true);
  assert.equal(Object.isFrozen(qluGrade), true);
  assert.equal(Object.isFrozen(qluGrade.matches), true);
  assert.equal(Object.isFrozen(qluGrade.matches.query), true);
  assert.equal(Object.isFrozen(qluGrade.files), true);
  assert.throws(() => registry.MODULES.push({}), TypeError);
  assert.throws(() => qluGrade.files.push('remote.js'), TypeError);
});

test('uses safe relative local paths for every registered runtime file', async () => {
  const extensionRoot = fileURLToPath(new URL('../', import.meta.url));
  const rootPrefix = extensionRoot.endsWith(path.sep) ? extensionRoot : `${extensionRoot}${path.sep}`;

  for (const module of registry.MODULES) {
    assert.ok(module.files.length > 0);
    for (const file of module.files) {
      assert.equal(typeof file, 'string');
      assert.equal(file.length > 0, true);
      assert.equal(file.includes('\\'), false);
      assert.equal(file.includes('?'), false);
      assert.equal(file.includes('#'), false);
      assert.equal(path.posix.isAbsolute(file), false);
      assert.equal(path.posix.normalize(file), file);
      assert.equal(file.split('/').includes('..'), false);

      const resolved = path.resolve(extensionRoot, ...file.split('/'));
      assert.equal(resolved.startsWith(rootPrefix), true);
      await access(resolved);
    }
  }
});

test('popup only informs users and never navigates tabs', async () => {
  const popupSource = await readFile(new URL('../popup/popup.js', import.meta.url), 'utf8');
  assert.match(popupSource, /setNotice\('unsupported', '当前不是成绩查询页/);
  assert.doesNotMatch(popupSource, /GRADE_PAGE_URL/);
  assert.doesNotMatch(popupSource, /chrome\.tabs\.(?:update|create)/);
});
