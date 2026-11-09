import { getFullScriptContent } from './appsScriptCode';

export const APIS = {
  SHEETS: 'https://sheets.googleapis.com/v4/spreadsheets',
  SCRIPT_PROJECTS: 'https://script.googleapis.com/v1/projects',
  DRIVE_FILES: 'https://www.googleapis.com/drive/v3/files'
};

const getHeaders = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
});

export type ColumnValidation =
  | { kind: 'listFromRange'; range: string; strict?: boolean } // strict=false：允許清單外的值，但會標紅色角標
  | { kind: 'list'; values: string[]; strict?: boolean }
  | { kind: 'checkbox' };

export interface ColumnDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean';
  // 寫在標題列的 ARRAYFORMULA，實際寫入為 ={"<name>"; <arrayFormula>}
  // 可使用 {{Tab.column}} / {{.column}} 佔位符，會被替換為 'Tab'!X2:X
  arrayFormula?: string;
  validation?: ColumnValidation;
  note?: string;      // 標題儲存格的註解
  readonly?: boolean; // 灰底 + 警告式保護
}

export interface TabDefinition {
  name: string;
  columns: ColumnDefinition[];
  hidden?: boolean;
  systemColumns?: boolean;              // 預設 true：加上 is_enabled / id / created_at / updated_at
  demoRows?: Record<string, unknown>[]; // 以欄位名稱為 key
  frozenRows?: number;                  // 預設 1
}

export interface SetupContext {
  sheetIds: Record<string, number>;
  columnIndex: (tab: string, column: string) => number;
  resolveRange: (expression: string, currentTab?: string) => string;
}

export interface CustomScript {
  code: string;           // 開發者自訂 GAS，以獨立檔案 (Custom.gs) 加入專案
  version?: string;       // 寫進檔案 description 的 scriptVersion
  oauthScopes?: string[]; // 與預設的 spreadsheets.currentonly 合併
}

const SYSTEM_START: ColumnDefinition[] = [
  { name: 'is_enabled', type: 'boolean', note: '勾選 = 啟用' }
];

const SYSTEM_END: ColumnDefinition[] = [
  { name: 'id', type: 'string', readonly: true, note: '系統自動填入' },
  { name: 'created_at', type: 'string', readonly: true, note: '系統自動填入' },
  { name: 'updated_at', type: 'string', readonly: true, note: '系統自動填入' }
];

const SYSTEM_COLUMN_NAMES = ['is_enabled', 'id', 'created_at', 'updated_at'];

const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/spreadsheets.currentonly'];

const READONLY_BACKGROUND = { red: 0.93, green: 0.93, blue: 0.93 };

const toColumnLetter = (index: number) => {
  let letter = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
};

// 範圍運算必須包在 ARRAYFORMULA 內才會展開成整欄，否則 Sheets 會回傳 #VALUE!
const toArrayFormula = (expression: string) =>
  /^\s*ARRAYFORMULA\s*\(/i.test(expression) ? expression : `ARRAYFORMULA(${expression})`;

const quoteSheetName = (name: string) => `'${name.replace(/'/g, "''")}'`;

const toCellValue = (value: unknown) => {
  if (typeof value === 'boolean') return { boolValue: value };
  if (typeof value === 'number') return { numberValue: value };
  return { stringValue: value === undefined || value === null ? '' : String(value) };
};

const withSystemColumns = (tab: TabDefinition): ColumnDefinition[] => {
  if (tab.systemColumns === false) return tab.columns;
  const custom = tab.columns.filter(c => !SYSTEM_COLUMN_NAMES.includes(c.name));
  return [...SYSTEM_START, ...custom, ...SYSTEM_END];
};

export async function createSpreadsheetWithTabs(
  token: string,
  title: string,
  tabs: TabDefinition[],
  setupRequests?: (ctx: SetupContext) => object[]
) {
  if (tabs.length === 0) throw new Error('At least one tab is required');

  const resolvedTabs = tabs.map((tab, i) => ({ ...tab, sheetId: i, allColumns: withSystemColumns(tab) }));

  const columnIndex = (tabName: string, column: string) => {
    const tab = resolvedTabs.find(t => t.name === tabName);
    if (!tab) throw new Error(`Unknown tab "${tabName}"`);
    const index = tab.allColumns.findIndex(c => c.name === column);
    if (index === -1) throw new Error(`Unknown column "${column}" in tab "${tabName}"`);
    return index;
  };

  // {{Tab.column}} → 'Tab'!X2:X；{{.column}} → 目前分頁
  const resolveRange = (expression: string, currentTab?: string) =>
    expression.replace(/\{\{\s*([^.{}]*)\.([^{}]+?)\s*\}\}/g, (_, tabName: string, column: string) => {
      const tab = tabName.trim() || currentTab;
      if (!tab) throw new Error(`Placeholder {{.${column}}} needs a current tab`);
      const letter = toColumnLetter(columnIndex(tab, column.trim()));
      return `${quoteSheetName(tab)}!${letter}2:${letter}`;
    });

  const sheetsConfig = resolvedTabs.map(tab => {
    const headerRow = {
      values: tab.allColumns.map(col => ({
        userEnteredValue: col.arrayFormula
          ? { formulaValue: `={"${col.name}"; ${toArrayFormula(resolveRange(col.arrayFormula, tab.name))}}` }
          : { stringValue: col.name },
        userEnteredFormat: { textFormat: { bold: true } },
        ...(col.note ? { note: col.note } : {})
      }))
    };

    const now = new Date().toISOString();
    const demoRows = (tab.demoRows || []).map(demo => ({
      values: tab.allColumns.map(col => {
        if (col.arrayFormula) return {};
        let value = demo[col.name];
        if (tab.systemColumns !== false) {
          if (col.name === 'id' && !value) value = crypto.randomUUID();
          if ((col.name === 'created_at' || col.name === 'updated_at') && !value) value = now;
          if (col.name === 'is_enabled' && value === undefined) value = true;
        }
        return { userEnteredValue: toCellValue(value) };
      })
    }));

    return {
      properties: {
        title: tab.name,
        sheetId: tab.sheetId,
        hidden: !!tab.hidden,
        gridProperties: {
          frozenRowCount: tab.frozenRows ?? 1,
          columnCount: Math.max(26, tab.allColumns.length)
        }
      },
      data: [{ startRow: 0, startColumn: 0, rowData: [headerRow, ...demoRows] }]
    };
  });

  const res = await fetch(APIS.SHEETS, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ properties: { title }, sheets: sheetsConfig })
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to create spreadsheet');
  }

  const data = await res.json();
  const spreadsheetId = data.spreadsheetId;
  const spreadsheetUrl = data.spreadsheetUrl;

  // 欄位驗證、唯讀樣式與保護 (套用到整欄，標題列除外)
  const requests: object[] = [];
  resolvedTabs.forEach(tab => {
    tab.allColumns.forEach((col, index) => {
      const range = { sheetId: tab.sheetId, startRowIndex: 1, startColumnIndex: index, endColumnIndex: index + 1 };

      const validation: ColumnValidation | undefined =
        col.validation || (col.type === 'boolean' ? { kind: 'checkbox' } : undefined);

      // 勾選框只放在範例資料列：沒勾的勾選框值是 FALSE，會讓整欄空白列都被當成有資料
      // 使用者之後新增的列，由內建 onEdit 補上勾選框
      const demoCount = tab.demoRows?.length ?? 0;
      const skipCheckbox = validation?.kind === 'checkbox' && demoCount === 0;

      if (validation && !skipCheckbox) {
        let rule: object;
        if (validation.kind === 'checkbox') {
          rule = { condition: { type: 'BOOLEAN' }, strict: true, showCustomUi: true };
        } else if (validation.kind === 'list') {
          rule = {
            condition: { type: 'ONE_OF_LIST', values: validation.values.map(v => ({ userEnteredValue: v })) },
            strict: validation.strict ?? true,
            showCustomUi: true
          };
        } else {
          rule = {
            condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: `=${resolveRange(validation.range, tab.name)}` }] },
            strict: validation.strict ?? true,
            showCustomUi: true
          };
        }
        requests.push({
          setDataValidation: {
            range: validation.kind === 'checkbox' ? { ...range, endRowIndex: 1 + demoCount } : range,
            rule
          }
        });
      }

      if (col.readonly || col.arrayFormula) {
        requests.push({
          repeatCell: {
            range,
            cell: { userEnteredFormat: { backgroundColor: READONLY_BACKGROUND } },
            fields: 'userEnteredFormat.backgroundColor'
          }
        });
        requests.push({
          addProtectedRange: {
            protectedRange: { range: { ...range, startRowIndex: 0 }, description: `${col.name} 由系統維護`, warningOnly: true }
          }
        });
      }
    });
  });

  if (setupRequests) {
    const sheetIds = Object.fromEntries(resolvedTabs.map(t => [t.name, t.sheetId]));
    requests.push(...setupRequests({ sheetIds, columnIndex, resolveRange }));
  }

  if (requests.length > 0) {
    const setupRes = await fetch(`${APIS.SHEETS}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ requests })
    });
    if (!setupRes.ok) {
      const errorData = await setupRes.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to set up spreadsheet');
    }
  }

  const sheetIds = Object.fromEntries(resolvedTabs.map(t => [t.name, t.sheetId]));
  return { id: spreadsheetId, spreadsheetUrl, sheetIds };
}

export async function createUserSpreadsheet(
  token: string, 
  title: string, 
  userColumns: ColumnDefinition[] = [],
  sheetName: string = "default"
) {
  
  // 1. Column Merging Logic
  // Enforce structure: is_enabled (First) -> User Columns -> id, created_at, updated_at (End)
  
  const fixedStart: ColumnDefinition[] = [
      { name: "is_enabled", type: "boolean" }
  ];

  const fixedEnd: ColumnDefinition[] = [
      { name: "id", type: "string" },
      { name: "created_at", type: "string" },
      { name: "updated_at", type: "string" }
  ];

  // Filter out any user provided columns that conflict with system columns
  const customColumns = userColumns.filter(c => 
    !['is_enabled', 'id', 'created_at', 'updated_at'].includes(c.name)
  );

  // If no custom columns provided, provide some simple defaults (Legacy support)
  if (customColumns.length === 0 && userColumns.length === 0) {
      customColumns.push(
          { name: "name", type: "string" },
          { name: "description", type: "string" },
          { name: "value", type: "number" }
      );
  }

  const allColumns: ColumnDefinition[] = [
      ...fixedStart,
      ...customColumns,
      ...fixedEnd
  ];

  // 產生標題列
  const headerRow = {
    values: allColumns.map(col => ({
      userEnteredValue: { stringValue: col.name }
    }))
  };

  // 產生範例資料列
  const demoRow = {
    values: allColumns.map(col => {
      let val: any = "";
      if (col.name === "id") val = "demo_01";
      else if (col.name === "created_at" || col.name === "updated_at") val = new Date().toISOString();
      else {
          switch(col.type) {
              case 'number': val = 123; break;
              case 'boolean': val = true; break;
              case 'string': val = "demo_content"; break;
              default: val = "";
          }
          // 針對舊有預設欄位的特定值
          if (col.name === "name") val = "範例項目";
          if (col.name === "description") val = "請在第一列↑定義欄位名稱(Key)，從第二列開始輸入您的資料。";
          if (col.name === "status") val = "active";
          if (col.name === "is_enabled") val = true;
      }
      
      if (typeof val === 'boolean') {
          return { userEnteredValue: { boolValue: val } };
      } else if (typeof val === 'number') {
          return { userEnteredValue: { numberValue: val } };
      } else {
          return { userEnteredValue: { stringValue: String(val) } };
      }
    })
  };

  // 設定初始表格內容
  const sheetsConfig = [
    {
      properties: { title: sheetName, sheetId: 0 }, // Explicitly set sheetId to 0 for referenced updates
      data: [
        {
          startRow: 0,
          startColumn: 0,
          rowData: [
             headerRow,
             demoRow
          ]
        }
      ]
    }
  ];

  const res = await fetch(APIS.SHEETS, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({
      properties: { title },
      sheets: sheetsConfig
    })
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to create spreadsheet');
  }

  const data = await res.json();
  const spreadsheetId = data.spreadsheetId;
  const spreadsheetUrl = data.spreadsheetUrl;

  // 2. Setup Data Validation for booleans (Checkbox)
  const booleanCols = allColumns
      .map((col, idx) => ({ ...col, index: idx }))
      .filter(col => col.type === 'boolean');
  
  if (booleanCols.length > 0) {
      const requests = booleanCols.map(col => ({
          setDataValidation: {
              range: {
                  sheetId: 0,
                  startRowIndex: 1, 
                  startColumnIndex: col.index,
                  endColumnIndex: col.index + 1,
                  endRowIndex: 2 // Only apply to the initial demo row (row index 1)
              },
              rule: {
                  condition: { type: "BOOLEAN" },
                  strict: true,
                  showCustomUi: true
              }
          }
      }));

      await fetch(`${APIS.SHEETS}/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: getHeaders(token),
          body: JSON.stringify({ requests })
      }).catch(e => console.error("Failed to set validation", e));
  }

  return { id: spreadsheetId, spreadsheetUrl };
}

export async function createScriptProject(token: string, parentId: string, title: string) {
  const res = await fetch(APIS.SCRIPT_PROJECTS, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ title, parentId })
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to create script project');
  }

  const data = await res.json();
  return data.scriptId;
}

export async function updateScriptContent(token: string, scriptId: string, script?: CustomScript) {
  const url = `${APIS.SCRIPT_PROJECTS}/${scriptId}/content`;

  const code = getFullScriptContent();

  const manifest = {
    timeZone: "Asia/Taipei",
    oauthScopes: Array.from(new Set([...DEFAULT_SCOPES, ...(script?.oauthScopes || [])])),
    runtimeVersion: "V8",
    webapp: { access: "ANYONE_ANONYMOUS", executeAs: "USER_DEPLOYING" }
  };

  const files = [
    { name: "appsscript", type: "JSON", source: JSON.stringify(manifest) },
    { name: "Code", type: "SERVER_JS", source: code }
  ];
  if (script?.code) {
    files.push({ name: "Custom", type: "SERVER_JS", source: script.code });
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: getHeaders(token),
    body: JSON.stringify({ files })
  });

  if (!res.ok) {
     const errorData = await res.json().catch(() => ({}));
     throw new Error(errorData.error?.message || 'Failed to update script content');
  }
}

async function createScriptVersion(token: string, scriptId: string, description: string) {
  const vRes = await fetch(`${APIS.SCRIPT_PROJECTS}/${scriptId}/versions`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ description })
  });

  if (!vRes.ok) {
      const errorData = await vRes.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to create script version');
  }

  const vData = await vRes.json();
  return vData.versionNumber as number;
}

export async function deployAsWebApp(token: string, scriptId: string) {
  const deployUrl = `${APIS.SCRIPT_PROJECTS}/${scriptId}/deployments`;
  const headers = getHeaders(token);

  // 1. Create Version
  const versionNumber = await createScriptVersion(token, scriptId, "Initial Version");

  // 2. Create Deployment
  const dRes = await fetch(deployUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ 
      versionNumber: versionNumber, 
      manifestFileName: "appsscript" 
    })
  });

  if (!dRes.ok) {
      const errorData = await dRes.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to deploy web app');
  }

  const dData = await dRes.json();
  return dData.entryPoints[0].webApp.url;
}

export async function updateFileDescription(token: string, fileId: string, description: string) {
    const url = `${APIS.DRIVE_FILES}/${fileId}`;
    await fetch(url, {
        method: 'PATCH',
        headers: getHeaders(token),
        body: JSON.stringify({ description })
    });
}

// 更新既有腳本並更新原本的 Web App deployment，scriptUrl 維持不變
export async function upgradeScript(
  token: string,
  file: { id: string; scriptId?: string; description?: string },
  script?: CustomScript
) {
  if (!file.scriptId) throw new Error('File has no scriptId in its metadata');
  const scriptId = file.scriptId;
  const headers = getHeaders(token);

  await updateScriptContent(token, scriptId, script);
  const versionNumber = await createScriptVersion(token, scriptId, `Upgrade ${script?.version || ''}`.trim());

  const listRes = await fetch(`${APIS.SCRIPT_PROJECTS}/${scriptId}/deployments`, { headers });
  if (!listRes.ok) {
    const errorData = await listRes.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to list deployments');
  }
  const listData = await listRes.json();
  // 找出目前使用中的 Web App 部署：優先比對檔案記錄的 scriptUrl
  // HEAD 部署（沒有 versionNumber）是唯讀的，更新會回 400，一律排除
  let currentUrl = '';
  try {
    currentUrl = file.description ? JSON.parse(file.description).scriptUrl || '' : '';
  } catch {
    currentUrl = '';
  }
  const webAppUrl = (d: any) => d.entryPoints?.find((e: any) => e.entryPointType === 'WEB_APP')?.webApp?.url;
  const versioned = (listData.deployments || []).filter((d: any) => d.deploymentConfig?.versionNumber && webAppUrl(d));
  const deployment = versioned.find((d: any) => webAppUrl(d) === currentUrl) || versioned[0];
  if (!deployment) throw new Error('No web app deployment found');

  const dRes = await fetch(`${APIS.SCRIPT_PROJECTS}/${scriptId}/deployments/${deployment.deploymentId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      deploymentConfig: { scriptId, versionNumber, manifestFileName: 'appsscript', description: script?.version || '' }
    })
  });
  if (!dRes.ok) {
    const errorData = await dRes.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to update deployment');
  }

  const dData = await dRes.json();
  const scriptUrl = dData.entryPoints?.find((e: any) => e.entryPointType === 'WEB_APP')?.webApp.url;

  let meta: Record<string, unknown> = {};
  try {
    meta = file.description ? JSON.parse(file.description) : {};
  } catch {
    meta = {};
  }
  const nextMeta = { ...meta, scriptId, scriptUrl: scriptUrl || meta.scriptUrl, scriptVersion: script?.version };
  await updateFileDescription(token, file.id, JSON.stringify(nextMeta));

  return { scriptUrl: nextMeta.scriptUrl as string, versionNumber };
}
