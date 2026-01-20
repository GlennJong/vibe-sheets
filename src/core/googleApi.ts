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

export interface ColumnDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean';
}

export async function createUserSpreadsheet(
  token: string, 
  title: string, 
  userColumns: ColumnDefinition[] = []
) {
  
  const defaultColumns: ColumnDefinition[] = [
      { name: "id", type: "string" },
      { name: "created_at", type: "string" },
      { name: "updated_at", type: "string" }
  ];

  // 若使用者未提供欄位，維持舊有的預設欄位以相容 (可視需求調整)
  const columnsToUse = userColumns.length > 0 
      ? userColumns 
      : [
          { name: "name", type: "string" },
          { name: "description", type: "string" },
          { name: "status", type: "string" }
        ] as ColumnDefinition[];

  // 合併: id + created_at + updated_at + userColumns
  // 注意：這裡將 userColumns 放在最後
  const allColumns = [...defaultColumns, ...columnsToUse];

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
      properties: { title: "Sheet1" },
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
  return { id: data.spreadsheetId, spreadsheetUrl: data.spreadsheetUrl };
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

export async function updateScriptContent(token: string, scriptId: string) {
  const url = `${APIS.SCRIPT_PROJECTS}/${scriptId}/content`;
  
  const code = getFullScriptContent();

  const manifest = {
    timeZone: "Asia/Taipei",
    oauthScopes: [
      "https://www.googleapis.com/auth/spreadsheets.currentonly"
    ],
    runtimeVersion: "V8",
    webapp: { access: "ANYONE_ANONYMOUS", executeAs: "USER_DEPLOYING" }
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers: getHeaders(token),
    body: JSON.stringify({
      files: [
        { name: "appsscript", type: "JSON", source: JSON.stringify(manifest) },
        { name: "Code", type: "SERVER_JS", source: code }
      ]
    })
  });

  if (!res.ok) {
     const errorData = await res.json().catch(() => ({}));
     throw new Error(errorData.error?.message || 'Failed to update script content');
  }
}

export async function deployAsWebApp(token: string, scriptId: string) {
  const versionUrl = `${APIS.SCRIPT_PROJECTS}/${scriptId}/versions`;
  const deployUrl = `${APIS.SCRIPT_PROJECTS}/${scriptId}/deployments`;
  const headers = getHeaders(token);

  // 1. Create Version
  const vRes = await fetch(versionUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ description: "Initial Version" })
  });

  if (!vRes.ok) {
      const errorData = await vRes.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to create script version');
  }
  
  const vData = await vRes.json();
  const versionNumber = vData.versionNumber;

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
