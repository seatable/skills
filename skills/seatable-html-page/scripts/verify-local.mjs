#!/usr/bin/env node
/** Local completeness or basic authentication check; no business data or saved tokens. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, parseOptions, projectRoot, validateConfig } from './dev-config.mjs';

export async function verifyConnection(config, { timeoutMs = 10000 } = {}) {
  validateConfig(config);
  if (['.', '..'].includes(config.appUuid)) throw new Error('appUuid must identify an application.');
  const url = `${config.server.replace(/\/+$/, '')}/api/v2.1/universal-apps/${encodeURIComponent(config.appUuid)}/access-token/`;
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Token ${config.accountToken}`, Accept: 'application/json' },
      redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error('redirect');
    }
    if (!response.ok) throw new Error(`http-${response.status}`);
    // A login page or HTTP 200 alone is not successful authentication.
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) { await reader.cancel(); throw new Error('payload'); }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof data?.access_token !== 'string' || !data.access_token.trim()) throw new Error('payload');
    // Do not persist or return the runtime access token.
  } catch (error) {
    await response?.body?.cancel().catch(() => {});
    if (error.message === 'redirect') throw new Error('Connection verification refused a redirect. Check the complete server URL locally.');
    if (/^http-(401|403)$/.test(error.message)) throw new Error('Authentication was rejected (401/403). Check accountToken and application access locally.');
    if (/^http-\d+$/.test(error.message)) throw new Error('Connection verification returned an unsuccessful HTTP status. Check server and appUuid locally.');
    if (error.message === 'payload' || error instanceof SyntaxError) throw new Error('Connection response did not contain a valid access token. Check server and appUuid locally.');
    throw new Error('Connection verification failed or timed out. Check network, TLS and local configuration; details were not displayed.');
  }
  return { connection: 'verified', pageAccess: 'pending', tableAccess: 'pending' };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.includes('--help')) console.log('node verify-local.mjs --project <project> [--check-only] (local completeness only; no authentication request with --check-only)');
    else {
      const args = process.argv.slice(2);
      const checkOnly = args.includes('--check-only');
      const options = parseOptions(args.filter(arg => arg !== '--check-only'), { project: process.cwd() }, ['project']);
      const config = loadConfig(projectRoot(options.project));
      if (checkOnly) console.log('Local development configuration is complete. No authentication request was made.');
      else {
        await verifyConnection(config);
        console.log('Basic connection verified. Page/table access is pending an authorized minimal read. No preview service was started.');
      }
    }
  } catch (error) {
    console.error(error.code ? 'Cannot safely verify local configuration.' : error.message);
    process.exitCode = 1;
  }
}
