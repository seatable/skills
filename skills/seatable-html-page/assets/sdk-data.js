/** Compare JSON-shaped descriptors without depending on object-member order. */
function sameMetadata(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every(key => Object.hasOwn(right, key) && sameMetadata(left[key], right[key]));
}

/** Map read-response keys without flattening cells or losing canonical system properties. */
export function normalizeRows(metadata, rows) {
  if (!Array.isArray(metadata) || !Array.isArray(rows)) {
    throw new Error('Row response is missing metadata/results arrays');
  }
  const columns = new Map();
  const outputSources = new Map([['_id', '_id']]);
  const reserveName = (name, key) => {
    if (outputSources.has(name) && outputSources.get(name) !== key) throw new Error('Column metadata contains conflicting output mappings');
    outputSources.set(name, key);
  };
  for (const column of metadata) {
    if (!column || typeof column.key !== 'string' || !column.key || typeof column.name !== 'string' || !column.name) {
      throw new Error('Column metadata requires a key and name');
    }
    if (columns.has(column.key)) {
      if (!sameMetadata(columns.get(column.key), column)) throw new Error('Column metadata contains conflicting duplicate keys');
      continue;
    }
    columns.set(column.key, column);
    if (column.key.startsWith('_')) reserveName(column.key, column.key);
    reserveName(column.key === '_id' ? '_id' : column.name, column.key);
  }
  return rows.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Row response contains an invalid row');
    const mapped = {};
    const setValue = (name, key, value) => {
      if ((outputSources.has(name) && outputSources.get(name) !== key) || Object.hasOwn(mapped, name)) {
        throw new Error('Row response contains conflicting output mappings');
      }
      // defineProperty avoids interpreting a schema name such as __proto__ as a setter.
      Object.defineProperty(mapped, name, { value, enumerable: true, writable: true, configurable: true });
    };
    for (const [key, value] of Object.entries(row)) {
      const name = key === '_id' ? '_id' : (columns.get(key)?.name || key);
      // System metadata can supply a display alias, but SDK consumers still need its raw key.
      if (key.startsWith('_') && name !== key) setValue(key, key, value);
      setValue(name, key, value);
    }
    return mapped;
  });
}

/** Reject incomplete local context before waiting for a nonexistent host bridge. */
export function validateDevConfig(options) {
  if (options === null || options === undefined) return null;
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Local development configuration has an invalid format');
  for (const key of ['server', 'appUuid', 'pageId', 'accountToken']) {
    if (typeof options[key] !== 'string' || !options[key].trim()) throw new Error('Local development configuration is missing required fields; check the local files');
  }
  return { server: options.server, appUuid: options.appUuid, pageId: options.pageId, accountToken: options.accountToken };
}

/** Share SDK initialization and parse read responses without substituting sample data on failure. */
export function createDataAccess(HTMLPageSDK, options = globalThis.window?.__HTML_PAGE_DEV_CONFIG__ || null) {
  const config = validateDevConfig(options);
  let initialization;
  const getSdk = () => {
    if (!initialization) {
      initialization = Promise.resolve().then(async () => {
        const sdk = new HTMLPageSDK(config ? { ...config } : null);
        if (!sdk || typeof sdk.init !== 'function') throw new Error('SDK requires an init method');
        await sdk.init();
        return sdk;
      });
    }
    return initialization;
  };
  async function listPage(tableName, { start = 0, limit = 100 } = {}) {
    if (typeof tableName !== 'string' || !tableName.trim()) throw new Error('A confirmed table name is required');
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(limit) || limit <= 0) throw new Error('Invalid pagination parameters');
    const sdk = await getSdk();
    if (typeof sdk.listRows !== 'function') throw new Error('listRows is unavailable in the selected SDK');
    return readPage(await sdk.listRows({ tableName, start, limit }), start);
  }
  function readPage(response, start) {
    const { metadata, results } = response?.data || {};
    const rows = normalizeRows(metadata, results);
    return { metadata, rows, nextStart: start + results.length, empty: results.length === 0 };
  }
  // Verify SDK method availability; server authorization failures propagate unchanged.
  async function queryPage(tableName, conditions, { start = 0, limit = 100 } = {}) {
    if (typeof tableName !== 'string' || !tableName.trim()) throw new Error('A confirmed table name is required');
    if (!Array.isArray(conditions) || !conditions.length || conditions.some(condition =>
      !condition || typeof condition !== 'object' || Array.isArray(condition) ||
      typeof condition.columnName !== 'string' || !condition.columnName.trim() ||
      !Object.hasOwn(condition, 'value') || condition.value === undefined ||
      Object.keys(condition).some(key => !['columnName', 'value'].includes(key)))) {
      throw new Error('Query conditions require only confirmed columnName/value pairs');
    }
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(limit) || limit <= 0 || limit > 500) throw new Error('Invalid query pagination parameters');
    const sdk = await getSdk();
    if (typeof sdk.queryRows !== 'function') throw new Error('queryRows is unavailable in the selected SDK');
    return readPage(await sdk.queryRows({ tableName, conditions, start, limit }), start);
  }
  async function loadAll(tableName, { limit = 100, maxPages = 1000, maxRows = 10000 } = {}) {
    if (!Number.isInteger(maxPages) || maxPages <= 0 || !Number.isInteger(maxRows) || maxRows <= 0) throw new Error('Invalid read safety limits');
    const rows = [];
    let start = 0;
    for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
      const page = await listPage(tableName, { start, limit });
      if (page.empty) return rows;
      if (rows.length + page.rows.length > maxRows) throw new Error('Data exceeds the read scope; use pagination or narrow the business scope');
      rows.push(...page.rows);
      start = page.nextStart;
    }
    throw new Error('Pagination exceeded the safety limit; partial results were not returned as complete data');
  }
  return Object.freeze({ getSdk, listPage, queryPage, loadAll });
}
