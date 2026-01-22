import { useState } from 'react';
import type { CreationResponse, DriveFile } from '../types';
import * as VibeSheetsApi from '../core/googleApi';

export const useSheetManager = (accessToken: string | null) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  
  const [creationResult, setCreationResult] = useState<CreationResponse | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  
  const [testData, setTestData] = useState<string>('');
  const [authUrl, setAuthUrl] = useState<string>('');

  const createSheet = async (options: {
    sheetName: string;
    prefix?: string;
    columns?: VibeSheetsApi.ColumnDefinition[];
  }) => {
    const { 
      sheetName, 
      prefix = 'vibesheet-', 
      columns = [
        { name: 'name', type: 'string' },
        { name: 'value', type: 'number' },
      ]
    } = options;

    if (!accessToken) return;
    if (!sheetName.trim()) {
      setError('請輸入表格名稱');
      return;
    }
    setLoading(true);
    setError('');
    setCreationResult(null);
    
    try {
      const fullName = `${prefix}${sheetName}`;
      
      // 1. Create Spreadsheet
      const { id: spreadsheetId, spreadsheetUrl } = await VibeSheetsApi.createUserSpreadsheet(
        accessToken,
        fullName,
        columns
      );

      // 2. Create Script Project
      const scriptId = await VibeSheetsApi.createScriptProject(accessToken, spreadsheetId, fullName);

      // 3. Update Script Content
      await VibeSheetsApi.updateScriptContent(accessToken, scriptId);

      // 4. Deploy as Web App
      const deploymentUrl = await VibeSheetsApi.deployAsWebApp(accessToken, scriptId);

      // 5. Update File Description
      const metaData = JSON.stringify({
        scriptId: scriptId,
        scriptUrl: deploymentUrl
      });
      await VibeSheetsApi.updateFileDescription(accessToken, spreadsheetId, metaData);

      const manualAuthTip = '請用擁有者 Google 帳號在瀏覽器開啟 scriptUrl 並完成授權，否則匿名存取會被 Google 拒絕 (403)。';

      setCreationResult({
        success: true,
        spreadsheetUrl,
        spreadsheetId,
        scriptUrl: deploymentUrl,
        tip: manualAuthTip
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || '建立資源時發生未知錯誤');
    } finally {
      setLoading(false);
    }
  };

  const fetchFiles = async (prefix: string = 'vibesheet-') => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    setAuthUrl(''); 
    setTestData(''); // clear legacy states

    try {
      const query = `name contains '${prefix}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name, webViewLink, description)`;
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('Drive API Error:', errorData);
        throw new Error(errorData.error?.message || `請求失敗 (${res.status}): 請確認 Google Drive API 已啟用`);
      }
      
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err: any) {
      setError(err.message || '取得列表失敗');
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async (file: DriveFile, fields: string = '') => {
    if (!accessToken) return;
    setLoading(true);
    setTestData('');
    setError('');
    setAuthUrl('');

    let scriptUrl = '';

    try {
      if (file.description) {
        try {
          const meta = JSON.parse(file.description);
          if (meta.scriptUrl) {
            scriptUrl = meta.scriptUrl;
          }
        } catch (e) {
          console.error(e);
        }
      }

      if (!scriptUrl) {
        // Fallback search logic
        const q = `'${file.id}' in parents and mimeType = 'application/vnd.google-apps.script' and trashed = false`;
        const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
        const driveRes = await fetch(driveUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!driveRes.ok) throw new Error('無法搜尋關聯的 Apps Script');
        const driveData = await driveRes.json();
        if (!driveData.files || driveData.files.length === 0) throw new Error('找不到關聯的 Script');
        const scriptId = driveData.files[0].id;

        const deployUrl = `https://script.googleapis.com/v1/projects/${scriptId}/deployments`;
        const deployRes = await fetch(deployUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (deployRes.ok) {
           const deployData = await deployRes.json();
           const webApp = deployData.deployments?.find((d: any) => d.entryPoints?.some((e: any) => e.entryPointType === 'WEB_APP'));
           if (webApp) scriptUrl = webApp.entryPoints[0].webApp.url;
        }
      }

      if (!scriptUrl) throw new Error('無法取得 Script URL');

      let noCacheUrl = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}t=${new Date().getTime()}`;
      
      if (fields && fields.trim()) {
        noCacheUrl += `&fields=${encodeURIComponent(fields.trim())}`;
      }

      const res = await fetch(noCacheUrl, {
        method: 'GET',
        redirect: 'follow',
        credentials: 'omit', 
      });

      if (!res.ok) throw new Error(`Script 請求失敗 (${res.status})`);

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         const text = await res.text();
         if (text.trim().startsWith("<")) {
            console.error('Script returned HTML:', text);
            throw new Error(`連線失敗 (CORS/權限問題)。請確認：\n1. 您是否已建立新的表格？(舊表格的 Script 權限未更新)\n2. Script 是否部署為「任何人 (含匿名)」？`);
         }
         try {
            const data = JSON.parse(text);
             if (data.error) throw new Error(`Script 回傳錯誤: ${data.error}`);
             setTestData(JSON.stringify(data.data || data, null, 2));
             return; 
         } catch {
             throw new Error(`回傳格式錯誤: ${text.substring(0, 100)}...`);
         }
      }

      const result = await res.json();
      if (result.error) throw new Error(`Script 回傳錯誤: ${result.error}`);

      const data = result.data;
      if (!data || (Array.isArray(data) && data.length === 0)) {
        setTestData('[] (目前無資料)');
      } else {
        setTestData(JSON.stringify(data, null, 2));
      }

    } catch (err: any) {
      console.error(err);
      if (err.message === 'Failed to fetch' || err.message.includes('CORS') || err.message.includes('HTML') || err.message.includes('403') || err.message.includes('連線失敗')) {
        setError(`需要授權：Google 要求您必須手動允許此腳本執行。`);
        setAuthUrl(scriptUrl);
      } else {
        setError(`測試失敗: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const addTestData = async (file: DriveFile, count: number = 1) => {
    if (!accessToken) return;
    setLoading(true);
    setTestData('');
    setError('');
    setAuthUrl('');

    let scriptUrl = '';

    try {
      if (file.description) {
        try {
          const meta = JSON.parse(file.description);
          if (meta.scriptUrl) {
            scriptUrl = meta.scriptUrl;
          }
        } catch (e) {
          console.error(e);
        }
      }

      if (!scriptUrl) {
        // Fallback search logic (duplicated from testConnection for safety)
        const q = `'${file.id}' in parents and mimeType = 'application/vnd.google-apps.script' and trashed = false`;
        const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
        const driveRes = await fetch(driveUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!driveRes.ok) throw new Error('無法搜尋關聯的 Apps Script');
        const driveData = await driveRes.json();
        if (!driveData.files || driveData.files.length === 0) throw new Error('找不到關聯的 Script');
        const scriptId = driveData.files[0].id;

        const deployUrl = `https://script.googleapis.com/v1/projects/${scriptId}/deployments`;
        const deployRes = await fetch(deployUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (deployRes.ok) {
           const deployData = await deployRes.json();
           const webApp = deployData.deployments?.find((d: any) => d.entryPoints?.some((e: any) => e.entryPointType === 'WEB_APP'));
           if (webApp) scriptUrl = webApp.entryPoints[0].webApp.url;
        }
      }

      if (!scriptUrl) throw new Error('無法取得 Script URL');

      const noCacheUrl = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}t=${new Date().getTime()}`;
      
      // Generate Dummy Data
      // We assume the sheet has 'name' and 'value' columns as per createSheet
      const dummyData = Array.from({ length: count }).map(() => ({
        name: `Test Item ${Math.floor(Math.random() * 1000)}`,
        value: Math.floor(Math.random() * 100),
        note: `Added by Vibe Coding on ${new Date().toLocaleTimeString()}` 
      }));

      // Use 'no-cors' mode? No, we want response.
      // Apps Script Web App POST handling with fetch can be tricky with CORS preflight.
      // Defaulting to text/plain (by not setting Content-Type to application/json) usually skips preflight
      // and lets Apps Script access the body string.
      const res = await fetch(noCacheUrl, {
        method: 'POST',
        body: JSON.stringify(dummyData)
      });

      if (!res.ok) throw new Error(`Script 請求失敗 (${res.status})`);
      
      const result = await res.json();
      if (result.error) throw new Error(`Script 回傳錯誤: ${result.error}`);

      setTestData(JSON.stringify(result, null, 2));

    } catch (err: any) {
      console.error(err);
       if (err.message === 'Failed to fetch' || err.message.includes('CORS') || err.message.includes('HTML') || err.message.includes('403') || err.message.includes('連線失敗')) {
        setError(`需要授權 (POST)：Google 要求您必須手動允許此腳本執行。`);
        setAuthUrl(scriptUrl);
      } else {
        setError(`新增失敗: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateTestData = async (file: DriveFile, targetIdInput?: string) => {
    if (!accessToken) return;
    setLoading(true);
    setTestData('');
    setError('');
    
    let scriptUrl = '';

    try {
      // 1. Resolve Script URL (Reuse logic)
       if (file.description) {
        try {
          const meta = JSON.parse(file.description);
          scriptUrl = meta.scriptUrl || '';
        } catch (e) { console.error(e); }
      }
      if (!scriptUrl) throw new Error('無法取得 Script URL，請確認表格建立正確。');
      
      const noCacheUrl = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}t=${new Date().getTime()}`;

      let targetId = targetIdInput;
      let targetitem: any = {};

      if (!targetId) {
        // 2. Fetch current data first to find an ID to update
        const getRes = await fetch(noCacheUrl);
        if (!getRes.ok) throw new Error('無法讀取現有資料以進行更新');
        const getResult = await getRes.json();
        
        if (!getResult.data || !Array.isArray(getResult.data) || getResult.data.length === 0) {
            throw new Error('表格目前是空的，請先新增資料再測試更新。');
        }

        // Pick the first item to update
        targetitem = getResult.data[0];
        targetId = targetitem.id;
        
        if (!targetId) throw new Error('資料中找不到 id 欄位，無法進行更新');
      }

      // 3. Perform Update
      const updatePayload = {
          id: targetId,
          name: targetIdInput ? `Updated via ID input` : `${targetitem?.name || 'Item'} (Updated ${new Date().toLocaleTimeString()})`,
          value: Math.floor(Math.random() * 9999)
      };

      // Append method=PUT to URL
      const updateUrl = `${noCacheUrl}&method=PUT`;
      
      const res = await fetch(updateUrl, {
          method: 'POST',
          body: JSON.stringify(updatePayload)
      });

      if (!res.ok) throw new Error(`Update 請求失敗 (${res.status})`);
      const result = await res.json();
      
      if (result.error) throw new Error(`Script Update Error: ${result.error}`);
      
      setTestData(JSON.stringify({
          action: 'Update Row',
          targetId: targetId,
          sentPayload: updatePayload,
          response: result
      }, null, 2));

    } catch (err: any) {
        console.error(err);
        setError(`更新失敗: ${err.message}`);
    } finally {
        setLoading(false);
    }
  };

  const deleteTestData = async (file: DriveFile) => {
    if (!accessToken) return;
    setLoading(true);
    setTestData('');
    setError('');
    
    let scriptUrl = '';

    try {
      if (file.description) {
        try {
          const meta = JSON.parse(file.description);
          scriptUrl = meta.scriptUrl || '';
        } catch (e) { console.error(e); }
      }
      if (!scriptUrl) throw new Error('無法取得 Script URL');
      
      const noCacheUrl = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}t=${new Date().getTime()}`;

      // 1. Get List
      const getRes = await fetch(noCacheUrl);
      if (!getRes.ok) throw new Error('無法讀取資料');
      const getResult = await getRes.json();
      
      if (!getResult.data || !Array.isArray(getResult.data) || getResult.data.length === 0) {
          throw new Error('無資料可刪除');
      }

      // Find first enabled item
      const targetItem = getResult.data.find((item: any) => item.is_enabled !== false && item.is_enabled !== 'FALSE');
      
      if (!targetItem) throw new Error('找不到有效 (is_enabled=true) 的資料可刪除，或資料皆已刪除。');
      
      const deleteUrl = `${noCacheUrl}&method=DELETE`;
      const res = await fetch(deleteUrl, {
          method: 'POST',
          body: JSON.stringify({ id: targetItem.id })
      });

      if (!res.ok) throw new Error(`Delete 請求失敗 (${res.status})`);
      const result = await res.json();
      
      if (result.error) throw new Error(`Script Delete Error: ${result.error}`);
      
      setTestData(JSON.stringify({
          action: 'Soft Delete Row',
          targetId: targetItem.id,
          response: result
      }, null, 2));

    } catch (err: any) {
        console.error(err);
        setError(`刪除失敗: ${err.message}`);
    } finally {
        setLoading(false);
    }
  };
  
  const resetCreation = () => setCreationResult(null);
  const clearTestData = () => setTestData('');
  const clearError = () => setError('');
  const clearAuthUrl = () => setAuthUrl('');

  return {
    loading,
    error,
    files,
    creationResult,
    testData,
    authUrl,
    createSheet,
    fetchFiles,
    testConnection,
    addTestData,
    updateTestData,
    deleteTestData,
    resetCreation,
    clearTestData,
    clearError,
    clearAuthUrl
  };
};
