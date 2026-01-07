import React, { useState, useEffect, useCallback } from 'react';

declare global {
  interface Window {
    google: any;
  }
}

// 定義後端回傳的資料格式
interface CreationResponse {
  scriptUrl?: string;
  spreadsheetUrl?: string;
  spreadsheetId?: string;
  success?: boolean;
  error?: string;
}

interface DriveFile {
  id: string;
  name: string;
  webViewLink: string;
  description?: string;
}

const CLIENT_ID = import.meta.env['VITE_GOOGLE_CLIENT_ID'];
const MASTER_SCRIPT_URL = import.meta.env['VITE_MASTER_SCRIPT_URL'];

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/script.deployments',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
].join(' ');

const App: React.FC = () => {
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // 頁面狀態管理
  const [view, setView] = useState<'login' | 'menu' | 'create' | 'list'>('login');
  
  // 建立表格相關
  const [sheetName, setSheetName] = useState<string>('');
  const [creationResult, setCreationResult] = useState<CreationResponse | null>(null);
  
  // 測試連線相關
  const [testData, setTestData] = useState<string>('');
  const [authUrl, setAuthUrl] = useState<string>(''); // 新增：授權連結

  // 列表相關
  const [files, setFiles] = useState<DriveFile[]>([]);

  // 初始化 Google SDK
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse: any) => handleTokenResponse(tokenResponse),
      });
      setTokenClient(client);
    };
    document.body.appendChild(script);
  }, []);

  // 進入列表模式時自動抓取資料
  useEffect(() => {
    if (view === 'list' && accessToken) {
      fetchFiles();
    }
  }, [view, accessToken]);

  // 處理 Token 回傳
  const handleTokenResponse = useCallback((response: any) => {
    if (response.error) {
      setError(`授權失敗: ${response.error}`);
      return;
    }
    setAccessToken(response.access_token);
    setError('');
    setView('menu');
  }, []);

  const handleStartProcess = () => {
    if (!tokenClient) {
      setError('Google SDK 尚未載入完成');
      return;
    }
    // 請求 Token
    tokenClient.requestAccessToken({ prompt: 'consent' });
  };

  const testConnection = async (file: DriveFile) => {
    setLoading(true);
    setTestData('');
    setError('');
    let scriptUrl = ''; // 將變數宣告移至 try/catch 外部

    try {
      // 嘗試從 description 解析
      if (file.description) {
        try {
          const meta = JSON.parse(file.description);
          if (meta.scriptUrl) {
            scriptUrl = meta.scriptUrl;
          }
        } catch (e) {
          // ignore parsing error
        }
      }

      console.log({scriptUrl})

      // 如果 description 沒有，則退回到原本的搜尋邏輯 (為了相容舊資料)
      if (!scriptUrl) {
        // 1. 搜尋該試算表關聯的 Apps Script Project
        const q = `'${file.id}' in parents and mimeType = 'application/vnd.google-apps.script' and trashed = false`;
        const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
        
        const driveRes = await fetch(driveUrl, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!driveRes.ok) throw new Error('無法搜尋關聯的 Apps Script');
        const driveData = await driveRes.json();

        if (!driveData.files || driveData.files.length === 0) {
          throw new Error('找不到關聯的 Script，請確認它是透過此工具建立的 (新版已支援自動綁定)');
        }

        const scriptId = driveData.files[0].id;
        // ... (下略: 取得 deployment)
        // 這裡簡化：若需要完整相容舊版，需要重寫一遍取得 deployment url 的邏輯
        // 為求精簡，我們假設如果 description 沒有，就提示使用者無法測試
        // 或者我們可以保留上面的邏輯
        
        // 2. 取得部署資訊 (Deployment) - 舊版補救
        const deployUrl = `https://script.googleapis.com/v1/projects/${scriptId}/deployments`;
        const deployRes = await fetch(deployUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (deployRes.ok) {
           const deployData = await deployRes.json();
           const webApp = deployData.deployments?.find((d: any) => d.entryPoints?.some((e: any) => e.entryPointType === 'WEB_APP'));
           if (webApp) scriptUrl = webApp.entryPoints[0].webApp.url;
        }
      }

      if (!scriptUrl) {
        throw new Error('無法取得 Script URL');
      }

      // 3. 呼叫 Web App 取得資料
      // 加入時間戳記避免快取，並不明確重送 cookies
      const noCacheUrl = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}t=${new Date().getTime()}`;
      
      const res = await fetch(noCacheUrl, {
        method: 'GET',
        redirect: 'follow',
        credentials: 'omit', // 關鍵：不要帶 Cookies，避免與 ANYONE_ANONYMOUS 衝突
      });
      
      // Apps Script Web App 常回應 302 重導向，fetch 預設會自動跟隨 (redirect: 'follow')
      // 如果瀏覽器仍回報 302 但沒拿到資料，通常是因為 CORS 或重導向後的 URL 問題
      // 但我們這裡先檢查回應
      
      if (!res.ok) {
        throw new Error(`Script 請求失敗 (${res.status})`);
      }

      // Apps Script 可能會回傳 HTML (錯誤頁) 或 JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         // 嘗試讀取文字內容看是否為錯誤訊息
         const text = await res.text();
         console.log(text)
         // 如果是 HTML，通常代表沒有正確取得 JSON
         if (text.trim().startsWith("<")) {
            console.error('Script returned HTML:', text);
            throw new Error(`連線失敗 (CORS/權限問題)。請確認：\n1. 您是否已建立新的表格？(舊表格的 Script 權限未更新)\n2. Script 是否部署為「任何人 (含匿名)」？`);
         }
         // 嘗試硬解 JSON
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
      
      if (result.error) {
        throw new Error(`Script 回傳錯誤: ${result.error}`);
      }

      const data = result.data;
      if (!data || (Array.isArray(data) && data.length === 0)) {
        setTestData('[] (目前無資料)');
      } else {
        setTestData(JSON.stringify(data, null, 2));
      }

    } catch (err: any) {
      console.error(err);
      
      // 若是 Network Error (通常是 CORS 或 302 導致)，提示用戶手動授權
      // 若是 Network Error (通常是 CORS 或 302 導致)，或者回傳 403 Forbidden，提示用戶手動授權
      if (err.message === 'Failed to fetch' || err.message.includes('CORS') || err.message.includes('HTML') || err.message.includes('403') || err.message.includes('連線失敗')) {
        setError(`需要授權：Google 要求您必須手動允許此腳本執行。`);
        setAuthUrl(scriptUrl);
      } else {
        setError(`測試失敗: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  }

  // 開啟授權彈窗
  const openAuthPopup = (url: string) => {
    const width = 500;
    const height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    // 使用 Google 登入樣式的 popup
    const newWin = window.open(url, 'GoogleAuth', `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=yes`);
    if (newWin) newWin.focus();
  };

  // 建立新表格
  const createSheet = async () => {
    if (!sheetName.trim()) {
      setError('請輸入表格名稱');
      return;
    }
    setLoading(true);
    setError('');
    
    try {
      const fullName = `vcqs-${sheetName}`;
      const targetUrl = `${MASTER_SCRIPT_URL}?token=${accessToken}&name=${encodeURIComponent(fullName)}`;
      
      const res = await fetch(targetUrl);
      if (!res.ok) throw new Error('網路請求失敗');
      
      const data: CreationResponse = await res.json();
      if (data.error) throw new Error(data.error);

      setCreationResult(data);
    } catch (err: any) {
      setError(err.message || '建立資源時發生未知錯誤');
    } finally {
      setLoading(false);
    }
  };

  // 取得檔案列表
  const fetchFiles = async () => {
    setLoading(true);
    setError('');
    try {
      const query = "name contains 'vcqs-' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
      // 增加 description 欄位
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

  // 登入畫面
  const renderLogin = () => (
    <div style={styles.card}>
      <button 
        onClick={handleStartProcess} 
        disabled={loading}
        style={{...styles.button, backgroundColor: loading ? '#ccc' : '#4285f4'}}
      >
        {loading ? '正在處理中...' : '授權並登入'}
      </button>
      {loading && <p style={styles.loadingText}>這可能需要幾秒鐘...</p>}
    </div>
  );

  // 選單畫面
  const renderMenu = () => (
    <div style={styles.card}>
      <h3>您想要做什麼？</h3>
      <div style={styles.menuButtonGroup}>
        <button onClick={() => setView('create')} style={styles.menuButton}>
          ➕ 新增表格
        </button>
        <button onClick={() => setView('list')} style={{...styles.menuButton, backgroundColor: '#34a853'}}>
          📂 檢視現有表格
        </button>
      </div>
    </div>
  );

  // 建立畫面
  const renderCreate = () => {
    if (creationResult) {
      return (
        <div style={styles.successCard}>
          <h3>🎉 部署完成！</h3>
          <p>您的表格與連動腳本已建立。</p>
          
          <div style={{margin: '20px 0', padding: '15px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', textAlign: 'left'}}>
            <strong style={{display: 'block', marginBottom: '10px', color: '#856404'}}>⚠️ 重要：最後一步</strong>
            <p style={{fontSize: '0.9rem', color: '#856404', margin: '0 0 10px 0'}}>
              由於這是新產生的自動化工具，Google 安全機制要求您必須手動授權一次。
            </p>
            <button 
              onClick={() => creationResult.scriptUrl && openAuthPopup(creationResult.scriptUrl)}
              style={{...styles.button, backgroundColor: '#ffc107', color: '#000', display: 'block', width: '100%', cursor: 'pointer', fontWeight: 'bold'}}
            >
              👉 點此開啟授權彈窗
            </button>
            <ul style={{fontSize: '0.85rem', color: '#666', marginTop: '10px', paddingLeft: '20px'}}>
              <li>彈窗開啟後，請登入您的帳號。</li>
              <li>請點擊 <b>Review Permissions</b> 並選擇您的帳號。</li>
              <li>若出現「Google hasn't verified this app」，請點擊 <b>Advanced (進階)</b> &gt; <b>Go to ... (unsafe)</b>。</li>
              <li>授權後若看到 JSON 資料即代表成功，請關閉該視窗。</li>
            </ul>
          </div>

          <p>授權完成後，您即可使用試算表：</p>
          <a href={creationResult.spreadsheetUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>
            開啟 Google 試算表
          </a>
          <div style={{ marginTop: '20px' }}>
            <button onClick={() => { setCreationResult(null); setView('menu'); }} style={styles.secondaryButton}>
              返回選單
            </button>
          </div>
        </div>
      );
    }
    return (
      <div style={styles.card}>
        <h3>新增表格</h3>
        <div style={styles.inputGroup}>
          <span style={styles.prefix}>vcqs-</span>
          <input 
            type="text" 
            value={sheetName} 
            onChange={(e) => setSheetName(e.target.value)} 
            placeholder="請輸入名稱"
            style={styles.input}
          />
        </div>
        <div style={styles.buttonGroup}>
          <button onClick={createSheet} disabled={loading} style={styles.button}>
            {loading ? '建立中...' : '建立'}
          </button>
          <button onClick={() => setView('menu')} style={styles.secondaryButton}>取消</button>
        </div>
      </div>
    );
  };

  // 列表畫面
  const renderList = () => (
    <div style={{width: '100%'}}>
      <div style={styles.headerRow}>
        <h3>現有表格 (vcqs-*)</h3>
        <button onClick={() => { setView('menu'); setTestData(''); setError(''); setAuthUrl(''); }} style={styles.secondaryButton}>返回</button>
      </div>

      {testData && (
        <div style={{...styles.card, marginBottom: '20px', backgroundColor: '#f8f9fa', borderColor: '#4285f4'}}>
          <h4>測試連線回傳資料</h4>
          <pre style={{textAlign: 'left', overflow: 'auto', maxHeight: '200px', fontSize: '0.85rem', backgroundColor: '#eee', padding: '10px', borderRadius: '4px'}}>
            {testData}
          </pre>
          <button onClick={() => setTestData('')} style={{...styles.secondaryButton, marginTop: '10px'}}>關閉結果</button>
        </div>
      )}

      {error && authUrl && (
        <div style={{...styles.card, marginBottom: '20px', backgroundColor: '#fff3cd', borderColor: '#ffc107', padding: '15px'}}>
          <h4 style={{marginTop: 0, color: '#856404'}}>⚠️ 需要授權 Script</h4>
          <p style={{fontSize: '0.9rem', color: '#856404'}}>由於這是新建立的自動化腳本，Google 需要您手動確認並授權一次才能被外部呼叫。</p>
          <div style={{display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '15px'}}>
            <button
              onClick={() => openAuthPopup(authUrl)}
              style={{...styles.button, backgroundColor: '#4285f4', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px'}}
            >
              <span style={{fontSize: '1.2rem'}}>🔑</span> 點此開啟授權彈窗
            </button>
          </div>
          <p style={{fontSize: '0.8rem', color: '#666', marginTop: '10px'}}>開啟後請點擊「Review Permissions」並選擇您的帳號，完成後請關閉視窗。</p>
          <p style={{fontSize: '0.8rem', fontWeight: 'bold'}}>授權完成後，請再次點擊下方的「測試連線」。</p>
        </div>
      )}

      {loading ? <p style={{textAlign: 'center'}}>處理中...</p> : (
        <ul style={styles.list}>
          {files.length === 0 ? <p style={{textAlign: 'center', color: '#666'}}>沒有找到相關表格</p> : files.map(file => (
            <li key={file.id} style={styles.listItem}>
              <span style={{fontWeight: 500}}>{file.name}</span>
              <a href={file.webViewLink} target="_blank" rel="noopener noreferrer" style={styles.linkButton}>
                開啟
              </a>
              <button onClick={() => testConnection(file)} style={styles.linkButton}>
                測試連線
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1>Google Sheets 快速部署器</h1>
        <p>此工具將自動為您建立包含自訂 Apps Script 邏輯的試算表</p>
        {accessToken && <p style={{fontSize: '0.8rem', color: 'green'}}>✓ 已登入 Google 帳號</p>}
      </header>

      <main style={styles.main}>
        {view === 'login' && renderLogin()}
        {view === 'menu' && renderMenu()}
        {view === 'create' && renderCreate()}
        {view === 'list' && renderList()}

        {error && <div style={styles.errorBox}>❌ {error}</div>}
      </main>
    </div>
  );
};

// 簡單的 CSS-in-JS 樣式
const styles: { [key: string]: React.CSSProperties } = {
  container: { maxWidth: '600px', margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui' },
  header: { textAlign: 'center', marginBottom: '40px' },
  main: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  card: { textAlign: 'center', padding: '30px', border: '1px dashed #ccc', borderRadius: '12px', width: '100%', backgroundColor: '#fff' },
  successCard: { padding: '30px', backgroundColor: '#eaffea', border: '1px solid #2ecc71', borderRadius: '12px', width: '100%', textAlign: 'center' },
  button: { padding: '12px 24px', fontSize: '1rem', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: '0.3s' },
  secondaryButton: { padding: '8px 16px', background: 'none', border: '1px solid #999', cursor: 'pointer', borderRadius: '4px', color: '#555' },
  link: { color: '#4285f4', fontWeight: 'bold', wordBreak: 'break-all' },
  errorBox: { marginTop: '20px', color: '#d32f2f', padding: '10px', backgroundColor: '#ffebee', borderRadius: '4px', width: '100%' },
  loadingText: { marginTop: '15px', color: '#666', fontSize: '0.9rem' },
  
  // 新增樣式
  menuButtonGroup: { display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '20px', flexWrap: 'wrap' },
  menuButton: { padding: '15px 25px', fontSize: '1rem', backgroundColor: '#4285f4', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', minWidth: '120px' },
  inputGroup: { display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '20px 0', gap: '10px' },
  prefix: { fontSize: '1.2rem', fontWeight: 'bold', color: '#555' },
  input: { padding: '10px', fontSize: '1rem', borderRadius: '4px', border: '1px solid #ccc', outline: 'none', width: '200px' },
  buttonGroup: { display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '10px' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '20px' },
  list: { listStyle: 'none', padding: 0, width: '100%', border: '1px solid #eee', borderRadius: '8px' },
  listItem: { display: 'flex', justifyContent: 'space-between', padding: '15px', borderBottom: '1px solid #eee', alignItems: 'center', backgroundColor: '#fff' },
  linkButton: { padding: '6px 12px', backgroundColor: '#e8f0fe', color: '#1967d2', borderRadius: '4px', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }
};

export default App;