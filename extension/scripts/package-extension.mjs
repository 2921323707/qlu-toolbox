import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const extensionRoot = projectRoot;
const distRoot = path.join(projectRoot, '..', 'dist');
const expectedVersion = '0.2.3';
const outputPath = path.join(distRoot, `toolbox-${expectedVersion}.zip`);
const fixedDosTime = 0;
const fixedDosDate = ((2000 - 1980) << 9) | (1 << 5) | 1;
const utf8Flag = 0x0800;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isDevelopmentFile(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  const lower = normalized.toLowerCase();
  const base = path.posix.basename(lower);
  if (/^(?:docs|scripts|tests)(?:\/|$)/.test(lower)) return true;
  if (['package.json', 'readme.md', 'changelog.md'].includes(base)) return true;
  if (base === '.ds_store' || base === 'thumbs.db' || base.endsWith('~')) return true;
  if (lower.endsWith('.map') || /\.(?:test|spec)\.[^/]+$/.test(lower)) return true;
  return /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)/.test(lower);
}

async function collectExtensionFiles(directory = extensionRoot, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectExtensionFiles(absolutePath, relativePath));
    } else if (entry.isFile() && !isDevelopmentFile(relativePath)) {
      files.push({ relativePath, absolutePath });
    }
  }
  return files;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let value = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    value = crcTable[(value ^ buffer[index]) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.relativePath, 'utf8');
    const data = entry.data;
    assert(name.length <= 0xffff, `ZIP path is too long: ${entry.relativePath}`);
    assert(data.length <= 0xffffffff, `ZIP entry is too large: ${entry.relativePath}`);
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(utf8Flag, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(fixedDosTime, 10);
    localHeader.writeUInt16LE(fixedDosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(utf8Flag, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(fixedDosTime, 12);
    centralHeader.writeUInt16LE(fixedDosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.length + name.length + data.length;
    assert(localOffset <= 0xffffffff, 'ZIP local data exceeds the ZIP32 limit');
  }

  const centralDirectory = Buffer.concat(centralParts);
  assert(entries.length <= 0xffff, 'ZIP contains too many entries');
  assert(centralDirectory.length <= 0xffffffff, 'ZIP central directory is too large');

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function verifyArchive(archive, expectedNames) {
  assert(archive.length >= 22, 'generated ZIP is truncated');
  const eocdOffset = archive.length - 22;
  assert(archive.readUInt32LE(eocdOffset) === 0x06054b50, 'generated ZIP has no terminal EOCD record');
  assert(archive.readUInt16LE(eocdOffset + 20) === 0, 'generated ZIP has an unexpected comment');

  const diskEntries = archive.readUInt16LE(eocdOffset + 8);
  const totalEntries = archive.readUInt16LE(eocdOffset + 10);
  const directorySize = archive.readUInt32LE(eocdOffset + 12);
  const directoryOffset = archive.readUInt32LE(eocdOffset + 16);
  assert(diskEntries === totalEntries, 'generated ZIP has inconsistent entry counts');
  assert(totalEntries === expectedNames.length, 'generated ZIP entry count differs from source files');
  assert(directoryOffset + directorySize === eocdOffset, 'generated ZIP central directory boundary is invalid');

  const names = [];
  let offset = directoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    assert(offset + 46 <= eocdOffset, 'generated ZIP central entry is truncated');
    assert(archive.readUInt32LE(offset) === 0x02014b50, 'generated ZIP central entry signature is invalid');
    const method = archive.readUInt16LE(offset + 10);
    const centralCrc = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const recordLength = 46 + nameLength + extraLength + commentLength;
    assert(offset + recordLength <= eocdOffset, 'generated ZIP central entry exceeds the directory');
    const name = archive.toString('utf8', offset + 46, offset + 46 + nameLength);
    names.push(name);
    assert(method === 0, `generated ZIP entry is not stored: ${name}`);
    assert(compressedSize === uncompressedSize, `generated ZIP stored sizes differ: ${name}`);
    assert(!name.startsWith('/') && !name.includes('\\') && !name.split('/').includes('..'), `unsafe ZIP path: ${name}`);

    assert(localOffset + 30 <= directoryOffset, `generated ZIP local header is truncated: ${name}`);
    assert(archive.readUInt32LE(localOffset) === 0x04034b50, `generated ZIP local signature is invalid: ${name}`);
    const localCrc = archive.readUInt32LE(localOffset + 14);
    const localSize = archive.readUInt32LE(localOffset + 18);
    const localUncompressedSize = archive.readUInt32LE(localOffset + 22);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const localName = archive.toString('utf8', localOffset + 30, localOffset + 30 + localNameLength);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + localSize;
    assert(localName === name, `generated ZIP local and central names differ: ${name}`);
    assert(localSize === compressedSize && localUncompressedSize === uncompressedSize, `generated ZIP sizes differ: ${name}`);
    assert(localCrc === centralCrc, `generated ZIP CRC headers differ: ${name}`);
    assert(dataEnd <= directoryOffset, `generated ZIP entry data exceeds local data area: ${name}`);
    assert(crc32(archive.subarray(dataStart, dataEnd)) === centralCrc, `generated ZIP CRC is invalid: ${name}`);

    offset += recordLength;
  }

  assert(offset === eocdOffset, 'generated ZIP central directory size is inconsistent');
  assert(names.every((name, index) => name === expectedNames[index]), 'generated ZIP file names are not sorted or complete');
  assert(names.includes('manifest.json'), 'manifest.json is not at the archive root');
  assert(names.every((name) => !name.startsWith('extension/')), 'archive paths must be rooted inside extension/');
  return names;
}

async function run() {
  const verification = spawnSync(process.execPath, [path.join(projectRoot, 'scripts', 'verify-extension.mjs')], {
    cwd: projectRoot,
    stdio: 'inherit',
    timeout: 180_000,
  });
  if (verification.status !== 0) {
    throw new Error(`verification failed with status ${verification.status ?? 'unknown'}`);
  }

  const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  assert(packageJson.version === expectedVersion, `package version must be ${expectedVersion}`);

  const sourceFiles = await collectExtensionFiles();
  sourceFiles.sort((left, right) => left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0);
  assert(sourceFiles.length > 0, 'extension contains no files');
  assert(sourceFiles.some((file) => file.relativePath === 'manifest.json'), 'extension manifest.json is missing');

  const entries = [];
  for (const file of sourceFiles) {
    entries.push({
      relativePath: file.relativePath,
      data: await readFile(file.absolutePath),
    });
  }

  const archive = createStoredZip(entries);
  await mkdir(distRoot, { recursive: true });
  const temporaryPath = path.join(distRoot, `.toolbox-${expectedVersion}.${process.pid}.${Date.now()}.tmp`);

  try {
    await writeFile(temporaryPath, archive, { flag: 'wx' });
    const writtenArchive = await readFile(temporaryPath);
    const expectedNames = entries.map((entry) => entry.relativePath);
    const archivedNames = verifyArchive(writtenArchive, expectedNames);
    try {
      await rename(temporaryPath, outputPath);
    } catch (error) {
      if (!error || (error.code !== 'EEXIST' && error.code !== 'EPERM')) throw error;
      await rm(outputPath, { force: true });
      await rename(temporaryPath, outputPath);
    }

    const digest = createHash('sha256').update(writtenArchive).digest('hex');
    console.log(`PASS package: ${path.relative(projectRoot, outputPath).replaceAll('\\', '/')} (${archivedNames.length} files, ${writtenArchive.length} bytes)`);
    console.log(`PASS SHA-256: ${digest}`);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

try {
  await run();
} catch (error) {
  console.error(`FAIL package: ${String(error && error.message ? error.message : error).replace(/\s+/g, ' ').trim()}`);
  process.exitCode = 1;
}
