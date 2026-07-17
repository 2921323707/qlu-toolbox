import { spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const extensionRoot = projectRoot;
const manifestPath = path.join(extensionRoot, 'manifest.json');
const expectedVersion = '0.2.3';
const expectedPermissions = ['activeTab', 'scripting'];
const forbiddenManifestKeys = [
  'host_permissions',
  'optional_host_permissions',
  'content_scripts',
  'web_accessible_resources',
];
const expectedIconSizes = new Map([
  ['16', 16],
  ['32', 32],
  ['48', 48],
  ['128', 128],
]);

let manifest = null;
let passed = 0;
let failed = 0;

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function equalSets(actual, expected) {
  if (actual.length !== expected.length) return false;
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  return sortedActual.every((value, index) => value === sortedExpected[index]);
}

function formatError(error) {
  if (!error) return 'unknown error';
  return String(error.message || error).replace(/\s+/g, ' ').trim();
}

async function check(name, operation) {
  try {
    await operation();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${formatError(error)}`);
  }
}

function isSafeRelativeLocalPath(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value.includes('\\') || value.includes('?') || value.includes('#') || value.includes('\0')) return false;
  if (path.posix.isAbsolute(value) || path.posix.normalize(value) !== value) return false;
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return false;
  const resolved = path.resolve(extensionRoot, ...segments);
  const rootPrefix = extensionRoot.endsWith(path.sep) ? extensionRoot : `${extensionRoot}${path.sep}`;
  return resolved.startsWith(rootPrefix);
}

async function requireExistingExtensionFile(relativePath, label) {
  assert(isSafeRelativeLocalPath(relativePath), `${label} is not a safe relative local path: ${relativePath}`);
  const absolutePath = path.resolve(extensionRoot, ...relativePath.split('/'));
  await access(absolutePath, fsConstants.R_OK);
  const details = await stat(absolutePath);
  assert(details.isFile(), `${label} is not a file: ${relativePath}`);
  return absolutePath;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

function readPngDimensions(buffer, label) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert(buffer.length >= 24, `${label} is too short to be a PNG`);
  assert(buffer.subarray(0, 8).equals(signature), `${label} has an invalid PNG signature`);
  assert(buffer.toString('ascii', 12, 16) === 'IHDR', `${label} is missing a leading IHDR chunk`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function importSourceModule(absolutePath) {
  const source = await readFile(absolutePath, 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

function collectManifestFileReferences(value) {
  const references = [];
  if (value.background && value.background.service_worker) {
    references.push(['background.service_worker', value.background.service_worker]);
  }
  if (value.action && value.action.default_popup) {
    references.push(['action.default_popup', value.action.default_popup]);
  }
  if (value.action && value.action.default_icon && typeof value.action.default_icon === 'object') {
    for (const [size, iconPath] of Object.entries(value.action.default_icon)) {
      references.push([`action.default_icon.${size}`, iconPath]);
    }
  }
  if (value.icons && typeof value.icons === 'object') {
    for (const [size, iconPath] of Object.entries(value.icons)) {
      references.push([`icons.${size}`, iconPath]);
    }
  }
  return references;
}

await check('package metadata', async () => {
  const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  assert(packageJson.version === expectedVersion, `package version must be ${expectedVersion}`);
  assert(packageJson.private === true, 'package must be private');
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    assert(!(key in packageJson), `package must not declare ${key}`);
  }
  const expectedScripts = {
    test: 'node --test tests/module-registry.test.mjs tests/grade-core.test.cjs',
    verify: 'node scripts/verify-extension.mjs',
    package: 'node scripts/package-extension.mjs',
  };
  assert(packageJson.scripts && typeof packageJson.scripts === 'object', 'package scripts are missing');
  for (const [name, command] of Object.entries(expectedScripts)) {
    assert(packageJson.scripts[name] === command, `package script ${name} must be exactly: ${command}`);
  }
});

await check('manifest JSON and version', async () => {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert(manifest.manifest_version === 3, 'manifest_version must be 3');
  assert(manifest.version === expectedVersion, `manifest version must be ${expectedVersion}`);
  assert(typeof manifest.name === 'string' && manifest.name.length > 0, 'manifest name is missing');
});

await check('manifest permissions', async () => {
  assert(manifest, 'manifest was not loaded');
  assert(Array.isArray(manifest.permissions), 'manifest permissions must be an array');
  assert(equalSets(manifest.permissions, expectedPermissions), 'permissions must be exactly activeTab and scripting');
  assert(new Set(manifest.permissions).size === manifest.permissions.length, 'manifest permissions contain duplicates');
});

await check('forbidden manifest keys', async () => {
  assert(manifest, 'manifest was not loaded');
  for (const key of forbiddenManifestKeys) {
    assert(!Object.prototype.hasOwnProperty.call(manifest, key), `manifest must not contain ${key}`);
  }
});

await check('manifest files and PNG icons', async () => {
  assert(manifest, 'manifest was not loaded');
  const references = collectManifestFileReferences(manifest);
  assert(references.length > 0, 'manifest has no file references');
  for (const [label, relativePath] of references) {
    await requireExistingExtensionFile(relativePath, label);
  }

  assert(manifest.icons && typeof manifest.icons === 'object', 'manifest icons are missing');
  assert(equalSets(Object.keys(manifest.icons), [...expectedIconSizes.keys()]), 'manifest icons must define 16, 32, 48, and 128');
  for (const [sizeKey, expectedSize] of expectedIconSizes) {
    const iconPath = manifest.icons[sizeKey];
    const absolutePath = await requireExistingExtensionFile(iconPath, `icons.${sizeKey}`);
    const dimensions = readPngDimensions(await readFile(absolutePath), iconPath);
    assert(
      dimensions.width === expectedSize && dimensions.height === expectedSize,
      `${iconPath} must be ${expectedSize}x${expectedSize}, got ${dimensions.width}x${dimensions.height}`,
    );
  }
});

await check('module registry paths', async () => {
  const registryPath = path.join(extensionRoot, 'core', 'module-registry.js');
  const registry = await importSourceModule(registryPath);
  assert(Array.isArray(registry.MODULES) && registry.MODULES.length > 0, 'module registry is empty');
  assert(Object.isFrozen(registry.MODULES), 'module registry array must be frozen');

  const ids = new Set();
  for (const module of registry.MODULES) {
    assert(module && typeof module === 'object', 'registry contains an invalid module');
    assert(Object.isFrozen(module), `module ${module.id || '(unknown)'} must be frozen`);
    assert(typeof module.id === 'string' && module.id.length > 0, 'module id is missing');
    assert(!ids.has(module.id), `duplicate module id: ${module.id}`);
    ids.add(module.id);
    assert(Array.isArray(module.files) && module.files.length > 0, `module ${module.id} has no files`);
    assert(Object.isFrozen(module.files), `module ${module.id} files must be frozen`);
    for (const relativePath of module.files) {
      await requireExistingExtensionFile(relativePath, `module ${module.id} file`);
    }
  }
});

await check('popup CSP-safe markup', async () => {
  assert(manifest, 'manifest was not loaded');
  const popupPath = manifest.action && manifest.action.default_popup;
  const absolutePath = await requireExistingExtensionFile(popupPath, 'action.default_popup');
  const html = await readFile(absolutePath, 'utf8');

  assert(!/<style\b/i.test(html), 'popup contains an inline <style> element');
  assert(!/\sstyle\s*=/i.test(html), 'popup contains an inline style attribute');
  assert(!/\son[a-z0-9_-]+\s*=/i.test(html), 'popup contains an inline event handler');
  assert(!/(?:href|src|action|formaction)\s*=\s*(["'])\s*javascript:/i.test(html), 'popup contains a javascript: URL');

  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  for (const script of scripts) {
    assert(/\bsrc\s*=\s*(["'])[^"']+\1/i.test(script[1]), 'popup contains a script without src');
    assert(script[2].trim() === '', 'popup contains inline script content');
  }
});

await check('runtime remote references', async () => {
  const files = await listFiles(extensionRoot);
  const textExtensions = new Set(['.css', '.html', '.js', '.json', '.mjs', '.svg']);
  const allowedOrigin = /^https:\/\/jw\.qlu\.edu\.cn(?:\/|$)/;
  const remotePattern = /https?:\/\/[^\s"'`<>)\\]+/g;
  const violations = [];

  for (const absolutePath of files) {
    const relativePath = path.relative(extensionRoot, absolutePath);
    if (relativePath.startsWith(`tests${path.sep}`)) continue;
    if (!textExtensions.has(path.extname(absolutePath).toLowerCase())) continue;
    const source = await readFile(absolutePath, 'utf8');
    for (const match of source.matchAll(remotePattern)) {
      if (!allowedOrigin.test(match[0])) {
        violations.push(`${relativePath} -> ${match[0]}`);
      }
    }
  }
  assert(violations.length === 0, `remote references are forbidden: ${violations.join(', ')}`);
});

await check('JavaScript syntax', async () => {
  const roots = [extensionRoot, path.join(projectRoot, 'scripts'), path.join(projectRoot, 'tests')];
  const scriptFiles = [];
  for (const root of roots) {
    const files = await listFiles(root);
    for (const absolutePath of files) {
      if (['.js', '.mjs', '.cjs'].includes(path.extname(absolutePath).toLowerCase())) {
        scriptFiles.push(absolutePath);
      }
    }
  }
  scriptFiles.sort((left, right) => left.localeCompare(right, 'en'));
  for (const absolutePath of scriptFiles) {
    const result = spawnSync(process.execPath, ['--check', absolutePath], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert(result.status === 0, `${path.relative(projectRoot, absolutePath)}: ${(result.stderr || result.stdout).trim()}`);
  }
});

await check('unit tests', async () => {
  const testFiles = [
    path.join(projectRoot, 'tests', 'module-registry.test.mjs'),
    path.join(projectRoot, 'tests', 'grade-core.test.cjs'),
  ];
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    fail(output || `test process exited with status ${result.status}`);
  }
});

if (failed > 0) {
  console.error(`FAIL verification: ${passed} passed, ${failed} failed`);
  process.exitCode = 1;
} else {
  console.log(`PASS verification: ${passed} checks passed`);
}
