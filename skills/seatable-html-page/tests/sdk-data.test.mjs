import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Assets are standalone ESM for generated browser projects; no new package.json is needed.
const source = await fs.readFile(new URL('../assets/sdk-data.js', import.meta.url));
const { normalizeRows, validateDevConfig, createDataAccess } = await import(`data:text/javascript;base64,${source.toString('base64')}`);
const structuredResponse = JSON.parse(await fs.readFile(new URL('./fixtures/sdk-response.json', import.meta.url), 'utf8'));
const customerId = 'Kx9Qw8RmP3aTv7NcY1sL4A';
const projectId = 'Uz6Wp3JqV8rKd2SaM5tB9Q';
function readSamples() {
  return {
    'Customers': { data: {
      metadata: [
        { key: 'c001', name: 'Customer name', type: 'text' },
        { key: 'c002', name: 'Status', type: 'single-select', data: { options: [{ name: 'In progress' }, { name: 'Completed' }] } },
        { key: 'c003', name: 'Linked projects', type: 'link' },
        { key: 'c004', name: 'Quantity', type: 'number' },
        { key: 'c005', name: 'Enabled', type: 'checkbox' },
        { key: 'c006', name: 'Files', type: 'file' },
        { key: 'c007', name: 'Images', type: 'image' },
        { key: 'c008', name: 'Location', type: 'geolocation', data: { geo_format: 'lng_lat' } },
        { key: 'c009', name: 'Owner', type: 'collaborator' },
        { key: 'c010', name: 'Default', type: 'text' },
        { key: 'c011', name: 'Calculated value', type: 'formula' },
        { key: 'c012', name: '__proto__', type: 'text' },
        { key: 'c013', name: 'Omitted field', type: 'text' },
        { key: 'c014', name: 'Tags', type: 'multiple-select' },
      ],
      results: [{
        _id: customerId, _creator: 'synthetic-user@example.invalid', _ctime: '2026-10-10T08:00:00+00:00',
        c001: 'Sample customer', c002: 'In progress', c003: [{ row_id: projectId, display_value: 'Sample project' }],
        c004: 0, c005: false, c006: [{ name: 'Example.pdf', size: 123, type: 'file', url: '/sample-assets/example.pdf' }],
        c007: ['/sample-assets/example.png'], c008: { lng: 0, lat: 1 }, c009: ['synthetic-user@example.invalid'],
        c010: null, c011: 42, c012: 'Safe text', c014: [],
      }],
    } },
    // Deliberately reuse a key: mapping must remain table-specific.
    'Projects': { data: { metadata: [{ key: 'c001', name: 'Project name', type: 'text' }], results: [{ _id: projectId, c001: 'Sample project' }] } },
  };
}

test('response samples use the production mapper and preserve IDs, system values and typed cells', () => {
  const { metadata, results } = readSamples()['Customers'].data;
  const [row] = normalizeRows(metadata, results);
  assert.equal(row._id, customerId);
  assert.equal(row._creator, results[0]._creator);
  assert.equal(row._ctime, results[0]._ctime);
  assert.equal(row['Customer name'], 'Sample customer');
  assert.equal(row['Status'], 'In progress');
  assert.equal(row['Quantity'], 0);
  assert.equal(row['Enabled'], false);
  assert.equal(row['Default'], null);
  assert.equal(row['Calculated value'], 42);
  assert.equal(Object.hasOwn(row, 'Omitted field'), false);
  assert.deepEqual(row['Tags'], []);
  assert.deepEqual(row['Location'], { lng: 0, lat: 1 });
  assert.deepEqual(row['Owner'], ['synthetic-user@example.invalid']);
  assert.deepEqual(row['Files'], results[0].c006);
  assert.deepEqual(row['Images'], ['/sample-assets/example.png']);
  assert.deepEqual(row['Linked projects'], [{ row_id: projectId, display_value: 'Sample project' }]);
  assert.equal(Object.getPrototypeOf(row), Object.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(row, '__proto__').value, 'Safe text');
  assert.equal(results[0]['Customer name'], undefined);
});

test('mapping preserves Unicode field names and system display aliases', () => {
  const metadata = [
    { key: 'amount', name: 'Amount (\u20ac)', type: 'number' },
    { key: '_ctime', name: 'Created at \u2014 UTC', type: 'ctime' },
  ];
  const results = [{ _id: 'one', amount: 0, _ctime: '2026-10-10T08:00:00+00:00' }];
  assert.deepEqual(normalizeRows(metadata, results), [{
    _id: 'one', 'Amount (\u20ac)': 0,
    _ctime: results[0]._ctime, 'Created at \u2014 UTC': results[0]._ctime,
  }]);
});

test('mapping is table-specific and does not modify response samples', () => {
  const samples = readSamples();
  const before = structuredClone(samples);
  const rows = Object.fromEntries(Object.entries(samples).map(([name, { data }]) => [name, normalizeRows(data.metadata, data.results)]));
  assert.equal(rows['Customers'][0]['Customer name'], 'Sample customer');
  assert.equal(rows['Projects'][0]['Project name'], 'Sample project');
  assert.equal(Object.hasOwn(rows['Projects'][0], 'Customer name'), false);
  assert.deepEqual(samples, before);
  assert.deepEqual(normalizeRows(samples['Customers'].data.metadata, []), []);
});

test('malformed read responses/metadata are rejected instead of rendered as empty success', () => {
  assert.throws(() => normalizeRows(undefined, []), /metadata/);
  assert.throws(() => normalizeRows([], undefined), /metadata/);
  assert.throws(() => normalizeRows([null], []), /metadata/);
  assert.throws(() => normalizeRows([{ key: 'x', name: '' }], []), /metadata/);
  assert.throws(() => normalizeRows([{ key: 'x', name: 'A' }, { key: 'x', name: 'B' }], []), /duplicate/);
  for (const row of [null, [], 'invalid']) assert.throws(() => normalizeRows([], [row]), /invalid row/);
});

test('development configuration is complete, copied and optional for host context', () => {
  assert.equal(validateDevConfig(null), null);
  assert.equal(validateDevConfig(undefined), null);
  for (const value of [[], '', {}, { server: 'https://example.invalid' }]) assert.throws(() => validateDevConfig(value), /configuration/);
  const config = { server: 'https://example.invalid', appUuid: 'synthetic-app', pageId: 'synthetic-page', accountToken: 'synthetic-token' };
  assert.deepEqual(validateDevConfig(config), config);
  assert.notEqual(validateDevConfig(config), config);
});

test('SDK reads share one asynchronous initialization and parse each table response', async () => {
  const samples = readSamples();
  let initialized = 0, constructed = 0, ready = false, instance;
  // Test-local stand-ins return fixed responses; no reusable SDK emulator or mutation state.
  class Sdk {
    constructor(options) { constructed++; assert.equal(options, null); instance = this; }
    async init() { initialized++; await Promise.resolve(); ready = true; }
    async listRows({ tableName }) { assert.equal(ready, true); return samples[tableName]; }
  }
  const data = createDataAccess(Sdk, null);
  const [customers, projects] = await Promise.all([data.listPage('Customers'), data.listPage('Projects')]);
  assert.equal(initialized, 1); assert.equal(constructed, 1);
  assert.equal(customers.rows[0]['Customer name'], 'Sample customer');
  assert.equal(projects.rows[0]['Project name'], 'Sample project');
  assert.equal(projects.rows[0]['Customer name'], undefined);
  assert.equal(await data.getSdk(), instance);
});

test('configuration and API errors propagate without sample fallback or repeated initialization', async () => {
  const config = { server: 'https://example.invalid', appUuid: 'synthetic-app', pageId: 'synthetic-page', accountToken: 'synthetic-token' };
  const denied = Object.assign(new Error('Synthetic permission denial'), { response: { status: 403 } });
  let constructed = 0, initialized = 0, requested = 0;
  class Sdk {
    constructor(options) { constructed++; assert.deepEqual(options, config); assert.notEqual(options, config); }
    async init() { initialized++; }
    async listRows() { requested++; throw denied; }
  }
  const data = createDataAccess(Sdk, config);
  await assert.rejects(data.listPage('Customers'), error => error === denied);
  assert.equal(requested, 1); // No automatic request retry after failure.
  await assert.rejects(data.listPage('Customers'), error => error === denied);
  assert.equal(requested, 2);
  assert.equal(constructed, 1); assert.equal(initialized, 1);
});

test('failed SDK initialization is shared without retries or fixture fallback', async () => {
  const failure = new Error('Synthetic initialization failure');
  let initialized = 0, requested = 0;
  class Sdk {
    async init() { initialized++; throw failure; }
    async listRows() { requested++; }
  }
  const data = createDataAccess(Sdk, null);
  await assert.rejects(data.listPage('Customers'), error => error === failure);
  await assert.rejects(data.getSdk(), error => error === failure);
  assert.equal(initialized, 1);
  assert.equal(requested, 0);
});

test('pagination advances by actual count, accepts short pages and stops on empty', async () => {
  const starts = [];
  const rows = [{ _id: 'one', x: 1 }, { _id: 'two', x: 2 }, { _id: 'three', x: 3 }];
  class Sdk {
    async init() {}
    async listRows({ start }) {
      starts.push(start);
      return { data: { metadata: [{ key: 'x', name: 'Value' }], results: rows.slice(start, start + 2) } };
    }
  }
  const data = createDataAccess(Sdk, null);
  assert.deepEqual((await data.loadAll('confirmed', { limit: 100 })).map(row => row.Value), [1, 2, 3]);
  assert.deepEqual(starts, [0, 2, 3]);
  await assert.rejects(data.loadAll('confirmed', { maxRows: 1 }), /scope/);
  await assert.rejects(data.loadAll('confirmed', { maxPages: 1 }), /safety/);
  await assert.rejects(data.loadAll('confirmed', { maxRows: 0 }), /safety/);
});

test('mid-pagination failures never return earlier response samples as a complete result', async () => {
  const network = new Error('Synthetic network failure');
  const sample = readSamples()['Customers'];
  class Sdk {
    async init() {}
    async listRows({ start }) { if (start > 0) throw network; return sample; }
  }
  const data = createDataAccess(Sdk, null);
  await assert.rejects(data.loadAll('Customers'), error => error === network);
});

test('read parameters and malformed envelopes fail instead of producing sample success', async () => {
  let calls = 0;
  class Sdk {
    async init() {}
    async listRows() { calls++; return { data: { results: [] } }; }
  }
  const data = createDataAccess(Sdk, null);
  for (const name of ['', null]) await assert.rejects(data.listPage(name), /table name/);
  for (const options of [{ start: -1 }, { limit: 0 }]) await assert.rejects(data.listPage('Customers', options), /pagination/);
  assert.equal(calls, 0);
  await assert.rejects(data.listPage('Customers'), /metadata/);
  assert.equal(calls, 1);
});

test('query parser respects result-only metadata and exact conditions without invoking listRows', async () => {
  let calls = 0;
  class Sdk {
    async init() {}
    async listRows() { assert.fail('Query must not fall back to listRows'); }
    async queryRows(params) {
      calls++;
      assert.deepEqual(params, { tableName: 'confirmed', conditions: [{ columnName: 'Reference', value: 0 }], start: 2, limit: 10 });
      return { data: { metadata: [{ key: 'q', name: 'Title', type: 'text' }], results: [{ _id: 'one', q: 'Visible' }] } };
    }
  }
  const data = createDataAccess(Sdk, null);
  const page = await data.queryPage('confirmed', [{ columnName: 'Reference', value: 0 }], { start: 2, limit: 10 });
  assert.deepEqual(page.rows, [{ _id: 'one', Title: 'Visible' }]);
  assert.equal(page.nextStart, 3); assert.equal(page.empty, false); assert.equal(calls, 1);
  for (const conditions of [[], [{ columnName: 'Reference' }], [{ columnName: 'Reference', value: 1, operator: 'OR' }]]) await assert.rejects(data.queryPage('confirmed', conditions), /conditions/);
  await assert.rejects(data.queryPage('confirmed', [{ columnName: 'Reference', value: 0 }], { limit: 501 }), /pagination/);
  assert.equal(calls, 1);
});

test('missing SDK methods fail explicitly instead of being replaced by simulated capabilities', async () => {
  class Sdk { async init() {} }
  const data = createDataAccess(Sdk, null);
  await assert.rejects(data.listPage('Customers'), /listRows is unavailable/);
  await assert.rejects(data.queryPage('Customers', [{ columnName: 'Status', value: 'In progress' }]), /queryRows is unavailable/);
  class InvalidSdk {}
  await assert.rejects(createDataAccess(InvalidSdk, null).getSdk(), /init method/);
});

test('representative responses preserve each raw cell and omission without applying metadata defaults', () => {
  const response = structuredClone(structuredResponse);
  const before = structuredClone(response);
  const { metadata, results } = response.data;
  const mapped = normalizeRows(metadata, results);
  assert.equal(mapped.length, results.length);
  // Compare every field, including formula/lookup shapes, file extras and all empty values.
  // Defaults, formats and formulas in metadata must not synthesize or rewrite cells.
  for (const [index, raw] of results.entries()) {
    for (const column of metadata) {
      const name = column.key === '_id' ? '_id' : column.name;
      const context = `row ${index}, ${column.name}`;
      assert.equal(Object.hasOwn(mapped[index], name), Object.hasOwn(raw, column.key), context);
      if (Object.hasOwn(raw, column.key)) assert.deepEqual(mapped[index][name], raw[column.key], context);
    }
  }
  assert.deepEqual(response, before);
});

test('identical repeated metadata is idempotent, including reordered JSON object members', () => {
  const column = { key: 'x', name: 'Status', type: 'single-select', data: { options: [{ id: 'one', name: 'To do' }], default_value: '' } };
  const repeated = { data: { default_value: '', options: [{ name: 'To do', id: 'one' }] }, type: 'single-select', name: 'Status', key: 'x' };
  assert.deepEqual(normalizeRows([column, repeated], [{ _id: 'one', x: 'To do' }]), [{ _id: 'one', 'Status': 'To do' }]);
});

test('conflicting repeated metadata is rejected rather than choosing the first or last entry', () => {
  const column = { key: 'x', name: 'Value', type: 'number', data: { precision: 2 }, table_id: 'synthetic-table' };
  for (const change of [{ name: 'Another value' }, { type: 'text' }, { data: { precision: 0 } }, { table_id: 'another-table' }]) {
    assert.throws(() => normalizeRows([column, { ...column, ...change }], []), /conflicting.*duplicate/);
  }
});

test('system metadata preserves canonical keys and exposes display aliases without renaming _id', () => {
  const { metadata, results } = structuredResponse.data;
  const [row] = normalizeRows(metadata, results);
  for (const key of ['_id', '_ctime', '_mtime', '_creator', '_last_modifier', '_archived', '_locked']) {
    assert.equal(row[key], results[0][key]);
  }
  assert.equal(row['Created time'], row._ctime);
  assert.equal(row['Modified time'], row._mtime);
  assert.equal(row['Creator'], row._creator);
  assert.equal(row['Last modifier'], row._last_modifier);
  assert.deepEqual(normalizeRows([{ key: '_id', name: 'Record ID', type: 'text', data: null }], [{ _id: 'one' }]), [{ _id: 'one' }]);
  assert.deepEqual(normalizeRows([], [{ _id: 'one', _future_property: { value: 0 } }]), [{ _id: 'one', _future_property: { value: 0 } }]);
});

test('ambiguous display aliases and system/unmapped-key collisions never overwrite cell values', () => {
  assert.throws(() => normalizeRows([{ key: 'x', name: 'Duplicate' }, { key: 'y', name: 'Duplicate' }], []), /conflicting.*mapping/);
  assert.throws(() => normalizeRows([{ key: '_ctime', name: 'Time' }, { key: 'x', name: '_ctime' }], []), /conflicting.*mapping/);
  for (const rows of [[], [{ x: 'not-an-id' }], [{ _id: 'one', x: 'not-an-id' }]]) {
    assert.throws(() => normalizeRows([{ key: 'x', name: '_id' }], rows), /conflicting.*mapping/);
  }
  for (const row of [{ x: 'mapped', unknown: 'raw' }, { unknown: 'raw', x: 'mapped' }]) {
    assert.throws(() => normalizeRows([{ key: 'x', name: 'unknown' }], [row]), /conflicting.*mapping/);
  }
});

test('data access accepts repeated system metadata and shares the production mapping path', async () => {
  class Sdk {
    async init() {}
    async listRows() { return structuredResponse; }
  }
  const page = await createDataAccess(Sdk, null).listPage('Structured sample');
  assert.deepEqual(page.rows, normalizeRows(structuredResponse.data.metadata, structuredResponse.data.results));
  assert.equal(page.metadata, structuredResponse.data.metadata); // Do not strip configuration or mutate the envelope.
  assert.equal(page.nextStart, 2);
});
