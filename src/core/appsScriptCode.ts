// appsScriptCode.ts

export const APPS_SCRIPT_CODE = {
  // doGet: 處理 GET 請求，負責讀取資料
  // 參數:
  // - sheet: (Optional) 指定要讀取的試算表名稱，若未指定則預設為第一個工作表
  // - fields: (Optional) 指定要回傳的欄位，逗號分隔 (e.g. ?fields=name,email)
  doGet: `
    function doGet(e) {
      try {
        var sheetName = e.parameter.sheet;
        var sheet;
        if (sheetName) {
          sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
          if (!sheet) {
             return createJsonResponse({ error: 'Sheet "' + sheetName + '" not found' });
          }
        } else {
          sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
        }

        var rows = sheet.getDataRange().getValues();
        
        if (rows.length === 0) {
          return createJsonResponse({ data: [] });
        }

        var headers = rows[0];
        
        // 解析 fields 參數 (例如: ?fields=name,value 或 ?fields=name+value)
        var fieldsParam = e.parameter.fields;
        var allowedFields = null;
        if (fieldsParam) {
           // 支援逗號或空格分隔
           allowedFields = fieldsParam.split(/[,\s+]+/).filter(function(f) { return f && f.trim().length > 0; });
        }

        // 1. 先處理 Soft Delete 過濾
        var isEnabledIndex = headers.indexOf('is_enabled');
        var validRows = rows.slice(1);
        
        if (isEnabledIndex !== -1) {
             validRows = validRows.filter(function(row) {
                var check = row[isEnabledIndex];
                return check !== false && check !== 'FALSE';
             });
        }
        
        // 2. 再處理欄位 Mapping 與 Filter
        var data = validRows.map(function(row) {
          var obj = {};
          headers.forEach(function(header, i) {
            if (header === 'is_enabled') return; // Always exclude is_enabled from output

            if (allowedFields) {
                // 修改：即使 filter 中沒有指定 id，也強制回傳 id 供前端辨識
                if (header === 'id' || allowedFields.indexOf(header) !== -1) {
                    obj[header] = row[i];
                }
            } else {
                obj[header] = row[i];
            }
          });
          return obj;
        });

        return createJsonResponse({ data: data });
      } catch (err) {
        return createJsonResponse({ error: err.toString() });
      }
    }
  `,

  // doPost: 處理 POST 請求，負責寫入資料
  // 參數:
  // - sheet: (Optional) 指定要操作的試算表名稱，若未指定則預設為第一個工作表
  // - method: (Optional) 指定操作方法 (PUT/UPDATE, DELETE)，若未指定則預設為 CREATE
  doPost: `
    function doPost(e) {
      try {
        var sheetName = e.parameter.sheet;
        var sheet;
        if (sheetName) {
          sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
          if (!sheet) {
             return createJsonResponse({ error: 'Sheet "' + sheetName + '" not found' });
          }
        } else {
          sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
        }

        var action = e.parameter.method || e.parameter.action;

        // --- UPDATE Logic ---
        if (action === 'PUT' || action === 'UPDATE') {
           var updateData;
           try {
              updateData = JSON.parse(e.postData.contents);
           } catch (err) {
              return createJsonResponse({ error: 'Invalid JSON for update', debug: err.toString() });
           }
           
           if (!updateData.id) {
               return createJsonResponse({ error: 'Update requires an "id" field' });
           }

           var lastRow = sheet.getLastRow();
           var lastCol = sheet.getLastColumn();
           if (lastRow <= 1) return createJsonResponse({ error: 'No data to update' });
           
           var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
           var idIndex = headers.indexOf('id');
           
           if (idIndex === -1) return createJsonResponse({ error: 'Sheet needs an "id" column' });
           
           // Find Row by ID
           var allIds = sheet.getRange(2, idIndex + 1, lastRow - 1, 1).getValues().map(function(r) { return r[0]; });
           var rowIndex = -1;
           var targetId = String(updateData.id);
           
           for (var i = 0; i < allIds.length; i++) {
               if (String(allIds[i]) === targetId) {
                   rowIndex = i + 2; 
                   break;
               }
           }
           
           if (rowIndex === -1) {
               return createJsonResponse({ error: 'ID not found: ' + updateData.id });
           }
           
           // Update Fields
           var updatedFields = [];
           Object.keys(updateData).forEach(function(key) {
               if (key === 'id') return; // Don't update ID
               
               var colIndex = headers.indexOf(key);
               if (colIndex !== -1) {
                   sheet.getRange(rowIndex, colIndex + 1).setValue(updateData[key]);
                   updatedFields.push(key);
               }
           });
           
           // Update updated_at
           var updatedAtIndex = headers.indexOf('updated_at');
           if (updatedAtIndex !== -1) {
               sheet.getRange(rowIndex, updatedAtIndex + 1).setValue(new Date().toISOString());
           }
           
           return createJsonResponse({ 
               status: 'success', 
               message: 'Row updated', 
               updatedFields: updatedFields,
               id: updateData.id 
           });
        }

        // --- DELETE Logic (Soft Delete) ---
        if (action === 'DELETE') {
           var deleteData;
           try {
              deleteData = JSON.parse(e.postData.contents);
           } catch (err) {
              return createJsonResponse({ error: 'Invalid JSON for delete', debug: err.toString() });
           }
           
           if (!deleteData.id) {
               return createJsonResponse({ error: 'Delete requires an "id" field' });
           }

           var lastRow = sheet.getLastRow();
           var lastCol = sheet.getLastColumn();
           if (lastRow <= 1) return createJsonResponse({ error: 'No data to delete' });
           
           var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
           var idIndex = headers.indexOf('id');
           var enabledIndex = headers.indexOf('is_enabled');
           
           if (idIndex === -1) return createJsonResponse({ error: 'Sheet needs an "id" column' });
           // 若沒有 is_enabled 欄位，就無法做軟刪除，這邊視為錯誤或直接 return
           if (enabledIndex === -1) return createJsonResponse({ error: 'Sheet needs an "is_enabled" column for soft delete' });
           
           var allIds = sheet.getRange(2, idIndex + 1, lastRow - 1, 1).getValues().map(function(r) { return r[0]; });
           
           var targetId = String(deleteData.id);
           var rowIndex = -1;
           
           for (var i = 0; i < allIds.length; i++) {
               // 使用 String() 確保型別一致，避免 123 != "123" 的問題
               if (String(allIds[i]) === targetId) {
                   rowIndex = i + 2; 
                   break;
               }
           }
           
           if (rowIndex === -1) {
               return createJsonResponse({ error: 'ID not found: ' + deleteData.id });
           }
           
           // update is_enabled to false
           sheet.getRange(rowIndex, enabledIndex + 1).setValue(false);
           
           // update updated_at if exists
           var updatedAtIndex = headers.indexOf('updated_at');
           if (updatedAtIndex !== -1) {
               sheet.getRange(rowIndex, updatedAtIndex + 1).setValue(new Date().toISOString());
           }
           
           return createJsonResponse({ status: 'success', message: 'Row soft deleted (is_enabled=false)', id: deleteData.id });
        }

        // --- CREATE Logic (Default) ---
        
        // 1. 解析傳入的 JSON 資料
        var postData;
        try {
          postData = JSON.parse(e.postData.contents);
        } catch (err) {
           return createJsonResponse({ error: 'Invalid JSON', debug: err.toString() });
        }
        
        // 判斷是單筆還是多筆
        var incomingRows = [];
        if (Array.isArray(postData)) {
           incomingRows = postData;
        } else {
           incomingRows = [postData];
        }

        if (incomingRows.length === 0) {
            return createJsonResponse({ message: 'No data to insert' });
        }
        
        // 2. 獲取現有的標頭
        // 我們假設第一列是 headers
        var lastCol = sheet.getLastColumn();
        if (lastCol === 0) {
           return createJsonResponse({ error: 'Sheet is empty (no headers)' });
        }
        
        // 讀取第一列 (Header)
        var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        
        // 3. 準備寫入的資料
        var newRows = [];
        var timestamp = new Date();
        var createdIds = [];
        
        incomingRows.forEach(function(rowObj) {
            var newRow = [];
            headers.forEach(function(header) {
                var value = rowObj[header];
                
                // 自動填入欄位處理
                if (header === 'id') {
                    if (!value) {
                       // 簡單產生唯一 ID
                       value = Utilities.getUuid();
                    } else {
                       // 強制轉為字串
                       value = String(value);
                    }
                } else if (header === 'created_at' && !value) {
                    value = timestamp.toISOString();
                } else if (header === 'updated_at' && !value) {
                    value = timestamp.toISOString();
                } else if (header === 'is_enabled' && (value === undefined || value === "")) {
                    value = true;
                }
                
                // 沒有值就填空字串，避免 undefined
                if (value === undefined || value === null) {
                    value = "";
                }
                
                newRow.push(value);
            });
            newRows.push(newRow);

            // 假設 headers 裡有 'id'，收集起來回傳
            var idIndex = headers.indexOf('id');
            if (idIndex !== -1) {
                createdIds.push(newRow[idIndex]);
            }
        });
        
        // 4. 寫入 Spreadsheet
        if (newRows.length > 0) {
            // 修正：不直接使用 sheet.getLastRow()，因為如果有整列 checkbox，getLastRow 會回傳 maxRows
            // 我們改為偵測 'id' 欄位來決定真正的最後一行
            var lastRowWithData = 1; // 至少有 Header
            var idIndex = headers.indexOf('id');
            
            if (idIndex !== -1) {
                // 讀取整欄 ID (假設資料量不超過 Sheet 上限，若很多可分批讀取或用其他方式優化)
                // getRange(row, col, numRows)
                // 讀取從第2列開始的所有 ID
                var maxRows = sheet.getMaxRows();
                if (maxRows > 1) {
                    var idValues = sheet.getRange(2, idIndex + 1, maxRows - 1, 1).getValues();
                    // 由後往前找第一個有值的
                    for (var i = idValues.length - 1; i >= 0; i--) {
                        if (idValues[i][0] && idValues[i][0] !== "") {
                            lastRowWithData = i + 2; // array index + 2 (because started from row 2)
                            break;
                        }
                    }
                }
            } else {
                // Fallback (若無 ID 欄位)
                lastRowWithData = sheet.getLastRow();
            }

            var startRow = lastRowWithData + 1;
            
            // data: newRows is already prepared
            var startRow = lastRowWithData + 1;
            
            // setValues 需要二維陣列，且大小需完全符合 Range
            sheet.getRange(startRow, 1, newRows.length, newRows[0].length).setValues(newRows);
            
            // 動態為新增的資料列設定 Checkbox 驗證
            // 針對 is_enabled 欄位，或任何值為 boolean 的欄位自動套用 Checkbox
            headers.forEach(function(header, idx) {
                var isBooleanCol = (header === 'is_enabled');
                
                // 若不是 is_enabled，檢查首筆資料該欄位是否為 boolean (簡易自動判斷)
                if (!isBooleanCol && newRows.length > 0) {
                    var sampleVal = newRows[0][idx];
                    if (typeof sampleVal === 'boolean') {
                        isBooleanCol = true;
                    }
                }

                if (isBooleanCol) {
                    var range = sheet.getRange(startRow, idx + 1, newRows.length, 1);
                    var rule = SpreadsheetApp.newDataValidation()
                      .requireCheckbox()
                      .setAllowInvalid(false)
                      .build();
                    range.setDataValidation(rule);
                }
            });
        }
        
        // 5. 回傳成功訊息
        return createJsonResponse({ 
           status: 'success', 
           message: newRows.length + ' row(s) appended',
           createdIds: createdIds
        });
        
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
