// Behavior tests for the generated Apps Script and the Sheets/Script API requests.
// Run: npm test (builds dist first). Uses an in-memory SpreadsheetApp mock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sdk = require('../dist/index.js');

function makeSheet(name, rows, maxRows = 20) {
  const sheet = {
    name,
    rows,
    maxRows,
    validations: [],
    getLastColumn: () => (sheet.rows[0] || []).length,
    getLastRow: () => {
      for (let i = sheet.rows.length - 1; i >= 0; i--) {
        if (sheet.rows[i].some(v => v !== '' && v !== null)) return i + 1;
      }
      return 0;
    },
    getMaxRows: () => sheet.maxRows,
    insertRowsAfter: (_after, n) => { sheet.maxRows += n; },
    getDataRange: () => sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()),
    getRange: (row, col, numRows = 1, numCols = 1) => ({
      getRow: () => row,
      getColumn: () => col,
      getLastRow: () => row + numRows - 1,
      getLastColumn: () => col + numCols - 1,
      getSheet: () => sheet,
      getValues: () =>
        Array.from({ length: numRows }, (_, r) =>
          Array.from({ length: numCols }, (_, c) => (sheet.rows[row - 1 + r] || [])[col - 1 + c] ?? '')),
      setValues: values => {
        if (row + values.length - 1 > sheet.maxRows) throw new Error('out of bounds');
        values.forEach((line, r) => {
          while (sheet.rows.length < row + r) sheet.rows.push(new Array(sheet.getLastColumn()).fill(''));
          line.forEach((v, c) => { sheet.rows[row - 1 + r][col - 1 + c] = v; });
        });
      },
      setValue: v => {
        while (sheet.rows.length < row) sheet.rows.push(new Array(sheet.getLastColumn()).fill(''));
        sheet.rows[row - 1][col - 1] = v;
      },
      setDataValidation: rule => sheet.validations.push({ row, col, numRows, rule })
    })
  };
  return sheet;
}

function makeContext(sheets, customCode) {
  let uuid = 0;
  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: n => sheets.find(s => s.name === n) || null,
        getSheets: () => sheets
      }),
      newDataValidation: () => {
        const b = { requireCheckbox: () => b, setAllowInvalid: () => b, build: () => 'checkbox' };
        return b;
      }
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: text => ({ text, setMimeType() { return this; } })
    },
    Utilities: { getUuid: () => `uuid-${++uuid}` },
    LockService: {
      getScriptLock: () => ({ tryLock: () => { ctx.lockHeld = true; return true; }, releaseLock: () => { ctx.lockHeld = false; } })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(sdk.getFullScriptContent(), ctx);
  if (customCode) vm.runInContext(customCode, ctx);
  return ctx;
}

const json = out => JSON.parse(out.text);
const H = ['is_enabled', 'name', 'status', 'stock', 'id', 'created_at', 'updated_at'];
const freshSheet = () => makeSheet('Products', [
  H.slice(),
  [true, 'A', 'active', 5, 'id-a', 't0', 't0'],
  [false, 'B', 'gone', 3, 'id-b', 't0', 't0']
]);
const post = (ctx, parameter, body) =>
  json(ctx.doPost({ parameter, postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }));
const editAt = (sheet, row, col, numRows = 1, numCols = 1) => ({ range: sheet.getRange(row, col, numRows, numCols) });

const CUSTOM = `
  var editHookCalls = 0;
  var VIBE_ROUTES = {
    GET: { ping: function (e) { return { pong: true, q: e.parameter.q }; } },
    POST: {
      orders: function (e) { return { received: JSON.parse(e.postData.contents).length }; },
      PUT: function () { return { hijacked: true }; }
    }
  };
  function VIBE_ON_EDIT(e) { editHookCalls++; }
`;

// ---------- CRUD ----------
test('GET reads rows and filters soft-deleted ones', () => {
  const res = json(makeContext([freshSheet()], CUSTOM).doGet({ parameter: {} }));
  assert.deepEqual(res.data.map(r => r.name), ['A']);
});

test('GET ?fields= splits on comma and whitespace, not on the letter s', () => {
  const ctx = makeContext([freshSheet()], CUSTOM);
  assert.deepEqual(json(ctx.doGet({ parameter: { fields: 'status' } })).data[0], { status: 'active', id: 'id-a' });
  assert.deepEqual(json(ctx.doGet({ parameter: { fields: 'name,stock' } })).data[0], { name: 'A', stock: 5, id: 'id-a' });
});

test('GET with an unknown action or without custom code falls back to CRUD', () => {
  assert.equal(json(makeContext([freshSheet()], CUSTOM).doGet({ parameter: { action: 'nope' } })).data.length, 1);
  assert.equal(json(makeContext([freshSheet()]).doGet({ parameter: { action: 'ping' } })).data.length, 1);
});

test('POST create fills id / is_enabled', () => {
  const sheet = freshSheet();
  const res = post(makeContext([sheet], CUSTOM), {}, [{ name: 'C' }]);
  assert.equal(res.status, 'success');
  assert.equal(sheet.rows[3][1], 'C');
  assert.equal(sheet.rows[3][0], true);
  assert.ok(sheet.rows[3][4]);
});

test('POST ?method=PUT stays CRUD even if VIBE_ROUTES.POST.PUT exists', () => {
  const sheet = freshSheet();
  assert.equal(post(makeContext([sheet], CUSTOM), { method: 'PUT' }, { id: 'id-a', stock: 9 }).status, 'success');
  assert.equal(sheet.rows[1][3], 9);
});

test('POST ?action=DELETE (legacy alias) soft deletes', () => {
  const sheet = freshSheet();
  post(makeContext([sheet], CUSTOM), { action: 'DELETE' }, { id: 'id-a' });
  assert.equal(sheet.rows[1][0], false);
});

// ---------- idempotency / locking / capacity ----------
test('POST create skips an id that already exists (retry after a lost response)', () => {
  const sheet = freshSheet();
  const ctx = makeContext([sheet], CUSTOM);
  post(ctx, {}, [{ id: 'tx-1', name: 'X' }]);
  const res = post(ctx, {}, [{ id: 'tx-1', name: 'X' }]);
  assert.deepEqual(res.skippedIds, ['tx-1']);
  assert.deepEqual(res.createdIds, []);
  assert.equal(sheet.rows.filter(r => r[4] === 'tx-1').length, 1);
  assert.equal(ctx.lockHeld, false);
});

test('POST create dedupes ids within one batch, rows without id always append', () => {
  const sheet = freshSheet();
  const ctx = makeContext([sheet], CUSTOM);
  const res = post(ctx, {}, [{ id: 'n1', name: 'a' }, { id: 'n1', name: 'a' }, { id: 'id-a', name: 'old' }, { name: 'x' }, { name: 'x' }]);
  assert.equal(res.createdIds.length, 3);
  assert.deepEqual(res.skippedIds, ['n1', 'id-a']);
});

test('POST create grows the grid when the sheet is full', () => {
  const sheet = freshSheet();
  sheet.maxRows = 3;
  const res = post(makeContext([sheet], CUSTOM), {}, [{ name: 'a' }, { name: 'b' }]);
  assert.equal(res.createdIds.length, 2);
  assert.equal(sheet.maxRows, 5);
});

test('CRUD lock is released on errors; custom routes do not take it', () => {
  const ctx = makeContext([freshSheet()], CUSTOM);
  post(ctx, {}, 'not json');
  assert.equal(ctx.lockHeld, false);
  const other = makeContext([freshSheet()], CUSTOM);
  post(other, { action: 'orders' }, [1]);
  assert.equal(other.lockHeld, undefined);
});

// ---------- custom routes / authorize ----------
test('custom GET and POST routes', () => {
  const ctx = makeContext([freshSheet()], CUSTOM);
  assert.deepEqual(json(ctx.doGet({ parameter: { action: 'ping', q: 'x' } })), { pong: true, q: 'x' });
  assert.deepEqual(post(ctx, { action: 'orders' }, [1, 2, 3]), { received: 3 });
  assert.ok(post(ctx, { action: 'orders' }, 'not json').error);
});

test('?action=authorize returns the success message and cannot be overridden', () => {
  const ctx = makeContext([freshSheet()], CUSTOM + 'VIBE_ROUTES.GET.authorize = function () { return 1; };');
  assert.equal(ctx.doGet({ parameter: { action: 'authorize' } }).text, 'Authorization successful. You can close this window.');
  assert.equal(sdk.getAuthorizeUrl('https://x/exec'), 'https://x/exec?action=authorize');
  assert.equal(sdk.getAuthorizeUrl('https://x/exec?a=1'), 'https://x/exec?a=1&action=authorize');
});

// ---------- onEdit ----------
test('onEdit fills system columns on a new row and adds a checkbox', () => {
  const sheet = freshSheet();
  sheet.rows.push([false, 'New', '', '', '', '', '']);
  const ctx = makeContext([sheet], CUSTOM);
  ctx.onEdit(editAt(sheet, 4, 2));
  const row = sheet.rows[3];
  assert.equal(row[0], true);
  assert.equal(row[4], 'uuid-1');
  assert.ok(row[5] && row[6]);
  assert.deepEqual(sheet.validations.at(-1), { row: 4, col: 1, numRows: 1, rule: 'checkbox' });
  assert.equal(ctx.editHookCalls, 1);
});

test('onEdit on an existing row only bumps updated_at', () => {
  const sheet = freshSheet();
  makeContext([sheet], CUSTOM).onEdit(editAt(sheet, 3, 3));
  const row = sheet.rows[2];
  assert.equal(row[0], false);
  assert.equal(row[4], 'id-b');
  assert.equal(row[5], 't0');
  assert.notEqual(row[6], 't0');
  assert.equal(sheet.validations.length, 0);
});

test('onEdit ignores header, auto columns, blank rows and tabs without system columns', () => {
  const sheet = freshSheet();
  const ctx = makeContext([sheet], CUSTOM);
  const before = JSON.stringify(sheet.rows);
  ctx.onEdit(editAt(sheet, 1, 2));
  ctx.onEdit(editAt(sheet, 2, 5));
  assert.equal(JSON.stringify(sheet.rows), before);

  sheet.rows.push([false, 'P1', '', '', '', '', ''], [false, '', '', '', '', '', ''], [false, 'P3', '', '', '', '', '']);
  ctx.onEdit(editAt(sheet, 4, 2, 3, 1));
  assert.equal(sheet.rows[3][4], 'uuid-1');
  assert.equal(sheet.rows[4][4], '');
  assert.equal(sheet.rows[5][4], 'uuid-2');

  const log = makeSheet('Log', [['time', 'qty'], ['t', 1]]);
  makeContext([log], CUSTOM).onEdit(editAt(log, 2, 2));
  assert.deepEqual(log.rows[1], ['t', 1]);
});

// ---------- API requests ----------
const captureFetch = () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ spreadsheetId: 'SID', spreadsheetUrl: 'URL' }) };
  };
  return calls;
};

test('createSpreadsheetWithTabs: tabs, placeholders, ARRAYFORMULA, validation, readonly', async () => {
  const calls = captureFetch();
  const result = await sdk.createSpreadsheetWithTabs('TOKEN', 'test', [
    {
      name: '商品',
      columns: [
        { name: '品名', type: 'string' },
        { name: '備貨數量', type: 'number' },
        { name: '目前庫存', type: 'number', arrayFormula: 'IF({{.id}}="", "", {{.備貨數量}} - SUMIF({{紀錄.商品編號}}, {{.id}}, {{紀錄.數量}}))' },
        { name: '已包', type: 'number', arrayFormula: 'ARRAYFORMULA({{.備貨數量}}*2)' }
      ],
      demoRows: [{ 品名: '範例', 備貨數量: 10 }]
    },
    {
      name: '組合',
      columns: [{ name: '品項', type: 'string', validation: { kind: 'listFromRange', range: '{{_選單.選項}}', strict: false } }]
    },
    { name: '紀錄', systemColumns: false, columns: [{ name: '商品編號', type: 'string' }, { name: '數量', type: 'number' }] },
    { name: '_選單', hidden: true, systemColumns: false, columns: [{ name: '選項', type: 'string' }] }
  ], ctx => [{ marker: ctx.sheetIds['組合'], col: ctx.columnIndex('商品', '品名') }]);

  const sheets = calls[0].body.sheets;
  assert.deepEqual(result.sheetIds, { 商品: 0, 組合: 1, 紀錄: 2, _選單: 3 });
  assert.equal(sheets[3].properties.hidden, true);

  const header = sheets[0].data[0].rowData[0].values;
  assert.deepEqual(header.map(c => c.userEnteredValue.stringValue || 'F'), ['is_enabled', '品名', '備貨數量', 'F', 'F', 'id', 'created_at', 'updated_at']);
  assert.equal(header[3].userEnteredValue.formulaValue,
    `={"目前庫存"; ARRAYFORMULA(IF('商品'!F2:F="", "", '商品'!C2:C - SUMIF('紀錄'!A2:A, '商品'!F2:F, '紀錄'!B2:B)))}`);
  assert.equal(header[4].userEnteredValue.formulaValue, `={"已包"; ARRAYFORMULA('商品'!C2:C*2)}`);

  const demo = sheets[0].data[0].rowData[1].values;
  assert.deepEqual(demo[0].userEnteredValue, { boolValue: true });
  assert.deepEqual(demo[3], {});

  const reqs = calls[1].body.requests;
  const dropdown = reqs.find(r => r.setDataValidation?.rule.condition.type === 'ONE_OF_RANGE');
  assert.equal(dropdown.setDataValidation.rule.condition.values[0].userEnteredValue, `='_選單'!A2:A`);
  assert.equal(dropdown.setDataValidation.rule.strict, false);
  const protectedCols = reqs.filter(r => r.addProtectedRange?.protectedRange.range.sheetId === 0)
    .map(r => r.addProtectedRange.protectedRange.range.startColumnIndex);
  assert.deepEqual(protectedCols, [3, 4, 5, 6, 7]);
  assert.deepEqual(reqs.at(-1), { marker: 1, col: 1 });
});

test('updateScriptContent: custom code as a separate file, scopes merged', async () => {
  const calls = captureFetch();
  await sdk.updateScriptContent('TOKEN', 'SCRIPT', { code: 'var X = 1;', oauthScopes: ['https://www.googleapis.com/auth/script.external_request'] });
  await sdk.updateScriptContent('TOKEN', 'SCRIPT');
  assert.deepEqual(calls[0].body.files.map(f => f.name), ['appsscript', 'Code', 'Custom']);
  assert.deepEqual(JSON.parse(calls[0].body.files[0].source).oauthScopes, [
    'https://www.googleapis.com/auth/spreadsheets.currentonly',
    'https://www.googleapis.com/auth/script.external_request'
  ]);
  assert.deepEqual(calls[1].body.files.map(f => f.name), ['appsscript', 'Code']);
});

test('checkboxes only cover demo rows; tabs without demo rows get none', async () => {
  const calls = captureFetch();
  await sdk.createSpreadsheetWithTabs('TOKEN', 'test', [
    { name: 'A', columns: [{ name: 'name', type: 'string' }, { name: 'flag', type: 'boolean' }], demoRows: [{ name: 'x' }, { name: 'y' }] },
    { name: 'B', columns: [{ name: 'name', type: 'string' }, { name: 'flag', type: 'boolean' }] }
  ]);
  const checkboxes = calls[1].body.requests
    .filter(r => r.setDataValidation?.rule.condition.type === 'BOOLEAN')
    .map(r => [r.setDataValidation.range.sheetId, r.setDataValidation.range.startColumnIndex, r.setDataValidation.range.endRowIndex]);
  assert.deepEqual(checkboxes, [[0, 0, 3], [0, 2, 3]]); // is_enabled + flag, rows 2–3 only
});

test('onEdit treats unchecked checkboxes as empty', () => {
  const sheet = makeSheet('Promos', [['is_enabled', 'name', 'flag', 'id', 'created_at', 'updated_at'], [false, '', false, '', '', '']]);
  makeContext([sheet], CUSTOM).onEdit(editAt(sheet, 2, 3));
  assert.deepEqual(sheet.rows[1], [false, '', false, '', '', '']);
});

test('upgradeScript updates the versioned deployment matching scriptUrl, never HEAD', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body && JSON.parse(opts.body) });
    if (url.endsWith('/versions')) return { ok: true, json: async () => ({ versionNumber: 7 }) };
    if (url.endsWith('/deployments') && !opts.method) {
      return { ok: true, json: async () => ({ deployments: [
        { deploymentId: 'HEAD', deploymentConfig: {}, entryPoints: [{ entryPointType: 'WEB_APP', webApp: { url: 'https://dev' } }] },
        { deploymentId: 'OTHER', deploymentConfig: { versionNumber: 2 }, entryPoints: [{ entryPointType: 'WEB_APP', webApp: { url: 'https://other' } }] },
        { deploymentId: 'LIVE', deploymentConfig: { versionNumber: 1 }, entryPoints: [{ entryPointType: 'WEB_APP', webApp: { url: 'https://live' } }] }
      ] }) };
    }
    if (opts.method === 'PUT' && url.includes('/deployments/')) {
      return { ok: true, json: async () => ({ entryPoints: [{ entryPointType: 'WEB_APP', webApp: { url: 'https://live' } }] }) };
    }
    return { ok: true, json: async () => ({}) };
  };
  const res = await sdk.upgradeScript('TOKEN', { id: 'FILE', scriptId: 'S', description: JSON.stringify({ scriptUrl: 'https://live' }) }, { code: 'x', version: '2.0.0' });
  const update = calls.find(c => c.method === 'PUT' && c.url.includes('/deployments/'));
  assert.ok(update.url.endsWith('/deployments/LIVE'));
  assert.deepEqual(update.body.deploymentConfig, { scriptId: 'S', versionNumber: 7, manifestFileName: 'appsscript', description: '2.0.0' });
  assert.equal(res.scriptUrl, 'https://live');
  const meta = JSON.parse(calls.find(c => c.method === 'PATCH').body.description);
  assert.deepEqual(meta, { scriptUrl: 'https://live', scriptId: 'S', scriptVersion: '2.0.0' });
});
