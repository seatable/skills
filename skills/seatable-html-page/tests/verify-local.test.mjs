import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyConnection } from '../scripts/verify-local.mjs';

const config = { server: '', appUuid: 'synthetic-app', pageId: 'synthetic-page', accountToken: 'synthetic-account-secret' };
const runtimeToken = 'synthetic-runtime-secret';
const script = fileURLToPath(new URL('../scripts/verify-local.mjs', import.meta.url));
async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}/service/path/`;
}
function localProject(t, value) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'seatable-verify-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, '.gitignore'), '/setting.js\n');
  if (value) fs.writeFileSync(path.join(root, 'setting.js'), `export default ${JSON.stringify(value)};`);
  return root;
}
function cli(root, ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, '--project', root, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    child.once('error', reject);
    child.once('exit', status => resolve({ status, stdout, stderr }));
  });
}

test('verification uses SDK auth route, preserves service path and does not claim page/table access', async t => {
  const calls = [];
  const server = await serve(t, (req, res) => {
    calls.push({ url: req.url, method: req.method, auth: req.headers.authorization });
    res.end(JSON.stringify({ access_token: runtimeToken }));
  });
  const result = await verifyConnection({ ...config, server });
  assert.deepEqual(result, { connection: 'verified', pageAccess: 'pending', tableAccess: 'pending' });
  assert.deepEqual(calls, [{ url: '/service/path/api/v2.1/universal-apps/synthetic-app/access-token/', method: 'GET', auth: `Token ${config.accountToken}` }]);
  assert.equal(JSON.stringify(result).includes(runtimeToken), false);
});

test('HTTP success without a valid access_token is rejected without exposing response data', async t => {
  for (const body of ['<html>Login</html>', '{}', '{bad JSON', JSON.stringify({ access_token: '' }), JSON.stringify({ access_token: 42 }), JSON.stringify({ detail: config.accountToken })]) {
    const server = await serve(t, (_req, res) => { res.end(body); });
    await assert.rejects(verifyConnection({ ...config, server }), error => /valid access token/.test(error.message) && !error.message.includes(config.accountToken));
  }
});

test('auth and HTTP failures stay sanitized; redirect does not forward credentials', async t => {
  let forwarded = 0;
  const other = await serve(t, (_req, res) => { forwarded++; res.end('{}'); });
  for (const status of [301, 302, 307, 401, 403, 404, 500]) {
    const server = await serve(t, (_req, res) => {
      res.writeHead(status, { Location: other });
      res.end(config.accountToken);
    });
    await assert.rejects(verifyConnection({ ...config, server }), error => {
      assert.equal(error.message.includes(config.accountToken), false);
      assert.equal(error.message.includes(other), false);
      return status < 400 ? /redirect/.test(error.message) : status === 401 || status === 403 ? /401\/403/.test(error.message) : /HTTP status/.test(error.message);
    });
  }
  assert.equal(forwarded, 0);
});

test('timeout, oversized response and network failures fail safely', async t => {
  const slow = await serve(t, (_req, _res) => {});
  await assert.rejects(verifyConnection({ ...config, server: slow }, { timeoutMs: 100 }), /failed or timed out/);
  const large = await serve(t, (_req, res) => { res.end('x'.repeat(70000)); });
  await assert.rejects(verifyConnection({ ...config, server: large }), /valid access token/);
  const dead = await serve(t, (req, _res) => { req.socket.destroy(); });
  await assert.rejects(verifyConnection({ ...config, server: dead }), /failed or timed out/);
});

test('verifier CLI leaves settings intact and saves no status/token files or preview service', async t => {
  let requests = 0;
  const server = await serve(t, (_req, res) => { requests++; res.end(JSON.stringify({ access_token: runtimeToken })); });
  const root = localProject(t, { ...config, server });
  const original = fs.readFileSync(path.join(root, 'setting.js'), 'utf8');
  const before = fs.readdirSync(root);
  const result = await cli(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Basic connection verified/);
  assert.match(result.stdout, /Page\/table access is pending/);
  assert.equal(result.stdout.includes(runtimeToken), false);
  assert.equal(result.stdout.includes(config.accountToken), false);
  assert.equal(result.stderr, '');
  assert.equal(requests, 1);
  assert.deepEqual(fs.readdirSync(root), before);
  assert.equal(fs.readFileSync(path.join(root, 'setting.js'), 'utf8'), original);
  // A later invocation validates changed settings instead of trusting a stored flag.
  fs.writeFileSync(path.join(root, 'setting.js'), `export default ${JSON.stringify({ ...config, server, pageId: '' })};`);
  assert.equal((await cli(root)).status, 1);
  assert.equal(requests, 1);
});

test('local completeness checks reuse configured values without authentication or verification records', async t => {
  let requests = 0;
  let status = 200;
  const server = await serve(t, (_req, res) => {
    requests++;
    res.writeHead(status);
    res.end(JSON.stringify({ access_token: runtimeToken }));
  });
  const root = localProject(t, { ...config, server });
  const before = fs.readdirSync(root);
  const check = async expectedRequests => {
    const source = fs.readFileSync(path.join(root, 'setting.js'), 'utf8');
    const result = await cli(root, '--check-only');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /configuration is complete/);
    assert.match(result.stdout, /No authentication request/);
    assert.equal(result.stdout.includes('connection verified'), false);
    for (const token of [config.accountToken, runtimeToken, 'changed-synthetic-account-secret']) {
      assert.equal(result.stdout.includes(token), false);
    }
    assert.equal(result.stderr, '');
    assert.equal(requests, expectedRequests);
    assert.deepEqual(fs.readdirSync(root), before);
    assert.equal(fs.readFileSync(path.join(root, 'setting.js'), 'utf8'), source);
  };
  await check(0); // No record of an earlier verification is required.
  assert.equal((await cli(root)).status, 0); // Configuration completion verifies once.
  assert.equal(requests, 1);
  status = 401; // Later completeness checks must not depend on current live access.
  await check(1);
  fs.writeFileSync(path.join(root, 'setting.js'), `export default ${JSON.stringify({ ...config, server, pageId: 'changed-page', accountToken: 'changed-synthetic-account-secret' })};`);
  await check(1); // Complete changes do not introduce an authentication gate.
});

test('missing, incomplete and executable settings stop verification before any request', async t => {
  let requests = 0;
  const server = await serve(t, (_req, res) => { requests++; res.end('{}'); });
  const root = localProject(t);
  for (const source of [undefined, `export default ${JSON.stringify({ ...config, server, accountToken: '' })};`, `export default ${JSON.stringify({ ...config, server, pageId: 'YOUR_PAGE_ID' })};`, `throw new Error('${config.accountToken}');`]) {
    if (source) fs.writeFileSync(path.join(root, 'setting.js'), source);
    for (const args of [[], ['--check-only']]) {
      const result = await cli(root, ...args);
      assert.equal(result.status, 1);
      assert.equal(result.stderr.includes(config.accountToken), false);
      assert.equal(result.stdout, '');
    }
  }
  assert.equal(requests, 0);
});
