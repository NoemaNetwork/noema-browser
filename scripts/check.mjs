// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = data => createHash('sha256').update(data).digest('hex');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.name, 'Noema');
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.host_permissions, ['https://app.noemanetwork.xyz/*']);
assert.deepEqual(manifest.content_scripts.map(script => script.matches), [manifest.host_permissions]);

const names = [];
async function visit(directory, prefix = '') {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(item.name)) continue;
    const name = prefix + item.name;
    assert(!item.isSymbolicLink(), `Unexpected symbolic link: ${name}`);
    if (item.isDirectory()) await visit(path.join(directory, item.name), name + '/');
    else if (item.isFile()) names.push(name);
    else throw Error(`Unexpected file type: ${name}`);
  }
}
await visit(root);
if (!process.argv.includes('--syntax-only')) {
  const hashes = JSON.parse(await readFile(path.join(root, 'SOURCE-HASHES.json'), 'utf8'));
  assert.deepEqual(names.filter(name => name !== 'SOURCE-HASHES.json').sort(), Object.keys(hashes).sort(), 'Source inventory changed.');
  for (const [name, expected] of Object.entries(hashes)) {
    assert.equal(hash(await readFile(path.join(root, name))), expected, `Source checksum changed: ${name}`);
  }
}

let syntaxChecks = 0;
let modulePaths = 0;
const moduleSources = {};
for (const name of names.filter(name => /\.(?:m?js)$/.test(name))) {
  const file = path.join(root, name);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, `Syntax error in ${name}: ${result.stderr}`);
  syntaxChecks++;
  moduleSources[name] = await readFile(file, 'utf8');
}
// Parse actual module declarations without evaluating source. A text search also
// matches examples in third-party comments, which are not runtime dependencies.
const parsed = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', `
  import vm from 'node:vm';
  import { readFileSync } from 'node:fs';
  const sources = JSON.parse(readFileSync(0, 'utf8'));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(sources).map(([name, source]) =>
    [name, new vm.SourceTextModule(source, { identifier: name }).dependencySpecifiers]))));
`], { input: JSON.stringify(moduleSources), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
assert.equal(parsed.status, 0, `Module parsing failed: ${parsed.stderr}`);
for (const [name, imports] of Object.entries(JSON.parse(parsed.stdout))) {
  for (const specifier of imports.filter(value => value.startsWith('.'))) {
    const target = path.resolve(path.dirname(path.join(root, name)), specifier);
    assert(target.startsWith(root + path.sep), `Module path escapes source: ${name}`);
    assert((await lstat(target)).isFile(), `Module path missing: ${name}`);
    modulePaths++;
  }
}
for (const name of [manifest.background.service_worker, manifest.options_page,
  ...manifest.content_scripts.flatMap(script => script.js), ...Object.values(manifest.icons)]) {
  assert((await lstat(path.join(root, name))).isFile(), `Manifest file missing: ${name}`);
}
console.log(JSON.stringify({ files: names.length, syntaxChecks, modulePaths,
  checksums: process.argv.includes('--syntax-only') ? 'skipped' : 'passed' }));
