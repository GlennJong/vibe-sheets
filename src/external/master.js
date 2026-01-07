/**
 * 接收前端傳來的 Token 並執行資源建立
 */
function doGet(e) {
  const userToken = e.parameter.token;
  const spreadsheetTitle = e.parameter.name || "快速產生的自動化工具";
  
  if (!userToken) {
    return createJsonResponse({ error: "未提供有效的 User Token" });
  }

  try {
    // 1. 建立新的試算表
    const ssInfo = createUserSpreadsheet(userToken, spreadsheetTitle);
    const spreadsheetId = ssInfo.id;
    const spreadsheetUrl = ssInfo.spreadsheetUrl;

    // 2. 在該試算表下建立 Apps Script 專案
    const scriptId = createScriptProject(userToken, spreadsheetId);

    // 3. 寫入 doGet 程式碼並設定 Web App 權限
    updateScriptContent(userToken, scriptId);

    // 4. 部署該腳本
    const deploymentUrl = deployAsWebApp(userToken, scriptId);

    // 5. 將 Script 資訊寫回試算表的 Description，方便前端讀取
    const metaData = JSON.stringify({
      scriptId: scriptId,
      scriptUrl: deploymentUrl
    });
    updateFileDescription(userToken, spreadsheetId, metaData);

    // 新增提示：API 建立的 Apps Script Web App 必須由擁有者手動開啟 scriptUrl 完成授權，匿名存取才會生效
    const manualAuthTip =
      '請用擁有者 Google 帳號在瀏覽器開啟 scriptUrl 並完成授權，否則匿名存取會被 Google 拒絕 (403)。';

    return createJsonResponse({
      success: true,
      spreadsheetUrl: spreadsheetUrl,
      spreadsheetId: spreadsheetId,
      scriptUrl: deploymentUrl,
      tip: manualAuthTip
    });

  } catch (err) {
    return createJsonResponse({ error: err.toString() });
  }
}

// --- Helper Functions ---

function createUserSpreadsheet(token, title) {
  const url = "https://sheets.googleapis.com/v4/spreadsheets";
  
  // 設定初始表格內容：第一列為 Key，第二列為範例資料
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
                { userEnteredValue: { stringValue: "請在第一列定義欄位名稱(Key)，從第二列開始輸入您的資料。" } },
                { userEnteredValue: { stringValue: "active" } }
              ]
            }
          ]
        }
      ]
    }
  ];

  const options = {
    method: "post",
    headers: { "Authorization": "Bearer " + token },
    contentType: "application/json",
    payload: JSON.stringify({ 
      properties: { title: title },
      sheets: sheetsConfig
    })
  };
  const res = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(res.getContentText());
  return { id: data.spreadsheetId, spreadsheetUrl: data.spreadsheetUrl };
}

function createScriptProject(token, parentId) {
  const url = "https://script.googleapis.com/v1/projects";
  const options = {
    method: "post",
    headers: { "Authorization": "Bearer " + token },
    contentType: "application/json",
    payload: JSON.stringify({ title: "MyAutoDoGet", parentId: parentId })
  };
  const res = UrlFetchApp.fetch(url, options);
  return JSON.parse(res.getContentText()).scriptId;
}

function updateScriptContent(token, scriptId) {
  const url = `https://script.googleapis.com/v1/projects/${scriptId}/content`;
  const code = `
    function doGet(e) {
      try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
        var rows = sheet.getDataRange().getValues();
        
        if (rows.length === 0) {
          return ContentService.createTextOutput(JSON.stringify({ data: [] }))
            .setMimeType(ContentService.MimeType.JSON);
        }

        var headers = rows[0];
        var data = rows.slice(1).map(function(row) {
          var obj = {};
          headers.forEach(function(header, i) {
            obj[header] = row[i];
          });
          return obj;
        });

        return ContentService.createTextOutput(JSON.stringify({ data: data }))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        // 確保發生錯誤時回傳 JSON，避免 HTML 錯誤頁導致 CORS 錯誤
        return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
  `;
  const manifest = {
    timeZone: "Asia/Taipei",
    oauthScopes: [
      "https://www.googleapis.com/auth/spreadsheets.currentonly",
      "https://www.googleapis.com/auth/spreadsheets"
    ],
    runtimeVersion: "V8",
    webapp: { access: "ANYONE_ANONYMOUS", executeAs: "USER_DEPLOYING" }
  };

  const options = {
    method: "put",
    headers: { "Authorization": "Bearer " + token },
    contentType: "application/json",
    payload: JSON.stringify({
      files: [
        { name: "appsscript", type: "JSON", source: JSON.stringify(manifest) },
        { name: "Code", type: "SERVER_JS", source: code }
      ]
    })
  };
  UrlFetchApp.fetch(url, options);
}

function deployAsWebApp(token, scriptId) {
  const versionUrl = `https://script.googleapis.com/v1/projects/${scriptId}/versions`;
  const deployUrl = `https://script.googleapis.com/v1/projects/${scriptId}/deployments`;
  const headers = { "Authorization": "Bearer " + token };

  // 1. 先建立版本 (Version)
  const vRes = UrlFetchApp.fetch(versionUrl, {
    method: "post",
    headers: headers,
    contentType: "application/json",
    payload: JSON.stringify({ description: "Initial Version" })
  });
  const versionNumber = JSON.parse(vRes.getContentText()).versionNumber;

  // 2. 建立部署 (Deployment)
  const dRes = UrlFetchApp.fetch(deployUrl, {
    method: "post",
    headers: headers,
    contentType: "application/json",
    payload: JSON.stringify({ versionNumber: versionNumber, manifestFileName: "appsscript" })
  });
  
  return JSON.parse(dRes.getContentText()).entryPoints[0].webApp.url;
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function updateFileDescription(token, fileId, description) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const options = {
    method: "patch",
    headers: { "Authorization": "Bearer " + token },
    contentType: "application/json",
    payload: JSON.stringify({ description: description })
  };
  UrlFetchApp.fetch(url, options);
}