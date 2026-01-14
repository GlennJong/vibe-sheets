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

  const createSheet = async (sheetName: string) => {
    if (!accessToken) return;
    if (!sheetName.trim()) {
      setError('請輸入表格名稱');
      return;
    }
    setLoading(true);
    setError('');
    setCreationResult(null);
    
    try {
      const fullName = `vibesheet-${sheetName}`;
      
      // 1. Create Spreadsheet
      const { id: spreadsheetId, spreadsheetUrl } = await VibeSheetsApi.createUserSpreadsheet(accessToken, fullName);

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

  const fetchFiles = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    setAuthUrl(''); 
    setTestData(''); // clear legacy states

    try {
      const query = "name contains 'vibesheet-' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
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

  const testConnection = async (file: DriveFile) => {
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

      const noCacheUrl = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}t=${new Date().getTime()}`;
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
    resetCreation,
    clearTestData,
    clearError,
    clearAuthUrl
  };
};
