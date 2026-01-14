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

export async function createUserSpreadsheet(token: string, title: string) {
  // 設定初始表格內容
  const sheetsConfig = [
    {
      properties: { title: "Sheet1" },
      data: [
        {
          startRow: 0,
          startColumn: 0,
          rowData: [
            // Row 1: Headers (Keys)
            {
              values: [
                { userEnteredValue: { stringValue: "id" } },
                { userEnteredValue: { stringValue: "name" } },
                { userEnteredValue: { stringValue: "description" } },
                { userEnteredValue: { stringValue: "status" } }
              ]
            },
            // Row 2: Example Content
            {
              values: [
                { userEnteredValue: { stringValue: "demo_01" } },
                { userEnteredValue: { stringValue: "範例項目" } },
                { userEnteredValue: { stringValue: "請在第一列↑定義欄位名稱(Key)，從第二列開始輸入您的資料。" } },
                { userEnteredValue: { stringValue: "active" } }
              ]
            }
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
      "https://www.googleapis.com/auth/spreadsheets.currentonly",
      "https://www.googleapis.com/auth/spreadsheets"
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
