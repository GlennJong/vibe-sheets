import { useState, useEffect, useCallback } from 'react';

declare global {
  interface Window {
    google: any;
  }
}

// 移除 import.meta.env 的依賴，改由參數傳入或全域設定，因為 SDK 不應依賴 Vite 特定變數
// const CLIENT_ID = import.meta.env['VITE_GOOGLE_CLIENT_ID'];

const SCOPES = [
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/script.deployments',
  'https://www.googleapis.com/auth/drive.file'
].join(' ');

export interface UseGoogleAuthOptions {
  clientId: string;
}

export const useGoogleAuth = ({ clientId }: UseGoogleAuthOptions) => {
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isAppsScriptEnabled, setIsAppsScriptEnabled] = useState<boolean | undefined>(undefined);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const checkAppsScriptStatus = useCallback(async (token: string) => {
    // 避免重複檢查
    // if (isChecking) return; 
    // 考慮到可能需要強制重試，這裡暫時不擋，但實務上最好有個 debounce

    setIsChecking(true);
    try {
      // 改用 Create 方法來測試，這是最準確的權限檢查
      // 嘗試建立一個空的暫存專案
      // 加上 timestamp 避免瀏覽器快取 403 回應
      const createResponse = await fetch(`https://script.googleapis.com/v1/projects?_t=${Date.now()}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'Auth Check (Auto Delete)'
        })
      });

      if (createResponse.status === 403) {
        // 403 無法建立 -> 幾乎肯定是因為沒啟用 API
        console.log('Apps Script API create check failed (403), assuming disabled.');
        setIsAppsScriptEnabled(false);
      } else if (createResponse.ok) {
        // 成功建立 -> 代表 API 絕對是開啟的
        setIsAppsScriptEnabled(true);
        
        // 為了不產生垃圾檔案，立即刪除剛剛建立的測試專案
        const data = await createResponse.json();
        const scriptId = data.scriptId;
        
        if (scriptId) {
          try {
            // 使用 Drive API 刪除檔案
            await fetch(`https://www.googleapis.com/drive/v3/files/${scriptId}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
          } catch (deleteErr) {
            console.warn('Failed to cleanup check file:', deleteErr);
          }
        }
      } else {
        // 其他錯誤 (500, etc) -> 保守起見，假設是開啟的，不阻擋使用者
        console.warn('Apps Script check returned unexpected status:', createResponse.status);
        setIsAppsScriptEnabled(true);
      }
    } catch (err) {
      console.error('檢查 Apps Script 狀態失敗:', err);
      // 發生網路錯誤等例外狀況，保守起見設為 true，避免錯誤引導
      setIsAppsScriptEnabled(true);
    } finally {
      setIsChecking(false);
    }
  }, []);

  const handleTokenResponse = useCallback((response: any) => {
    if (response.error) {
      setError(`授權失敗: ${response.error}`);
      setLoading(false);
      return;
    }
    setAccessToken(response.access_token);
    checkAppsScriptStatus(response.access_token);
    setError('');
    setLoading(false);
  }, [checkAppsScriptStatus]);


  useEffect(() => {
    if (!clientId) return;
    
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (tokenResponse: any) => handleTokenResponse(tokenResponse),
      });
      setTokenClient(client);
    };
    document.body.appendChild(script);
  }, [handleTokenResponse, clientId]);

  const login = () => {
    if (!tokenClient) {
      setError('Google SDK 尚未載入完成');
      return;
    }
    setLoading(true);
    tokenClient.requestAccessToken({ prompt: 'consent' });
  };

  const recheckAuth = useCallback(() => {
    if (accessToken) {
      checkAppsScriptStatus(accessToken);
    }
  }, [accessToken, checkAppsScriptStatus]);

  return { 
    accessToken, 
    login, 
    loading, 
    error, 
    isAppsScriptEnabled, 
    setIsAppsScriptEnabled, // Expose setter for manual bypass
    isChecking, 
    recheckAuth 
  };
};
