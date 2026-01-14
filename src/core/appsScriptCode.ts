// appsScriptCode.ts

export const APPS_SCRIPT_CODE = {
  // doGet: 處理 GET 請求，負責讀取資料
  doGet: `
    function doGet(e) {
      try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
        var rows = sheet.getDataRange().getValues();
        
        if (rows.length === 0) {
          return createJsonResponse({ data: [] });
        }

        var headers = rows[0];
        var data = rows.slice(1).map(function(row) {
          var obj = {};
          headers.forEach(function(header, i) {
            obj[header] = row[i];
          });
          return obj;
        });

        return createJsonResponse({ data: data });
      } catch (err) {
        return createJsonResponse({ error: err.toString() });
      }
    }
  `,

  // doPost: 未來實作 POST 請求處理 (可以擴充)
  doPost: `
    function doPost(e) {
       try {
         // 在此實作 POST 邏輯，例如新增資料
         // var data = JSON.parse(e.postData.contents);
         return createJsonResponse({ status: 'not_implemented' });
       } catch (err) {
         return createJsonResponse({ error: err.toString() });
       }
    }
  `,

  // Helper: 用於標準化 JSON 回應的輔助函式
  helpers: `
    function createJsonResponse(data) {
      return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
    }
  `
};

// 組合完整的 Script 內容
export const getFullScriptContent = () => {
  return [
    APPS_SCRIPT_CODE.doGet,
    APPS_SCRIPT_CODE.doPost,
    APPS_SCRIPT_CODE.helpers
  ].join('\n\n');
};
