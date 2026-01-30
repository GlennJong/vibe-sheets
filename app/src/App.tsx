import React, { useState, useEffect } from 'react';
import { Callout, Text, Button } from '@radix-ui/themes';
import { ExclamationTriangleIcon, CheckCircledIcon } from '@radix-ui/react-icons';

import { useGoogleAuth } from '../../src/react/useGoogleAuth';
import { useSheetManager } from '../../src/react/useSheetManager';

import { Layout } from './components/Layout';
import { LoginView } from './views/LoginView';
import { MenuView } from './views/MenuView';
import { CreateSheetView } from './views/CreateSheetView';
import { SheetListView } from './views/SheetListView';
import { AuthWarning } from './components/AuthWarning';
import { RemoveView } from './views/RemoveView';


type View = 'login' | 'menu' | 'create' | 'list' | 'remove';

const App: React.FC = () => {
  const { 
    accessToken, 
    login, 
    loading: authLoading, 
    error: authError, 
    isAppsScriptEnabled, 
    setIsAppsScriptEnabled,
    recheckAuth 
  } = useGoogleAuth({
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  });

  const { 
    loading: sheetLoading, 
    error: sheetError, 
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
    clearAuthUrl,
    creationStatus
  } = useSheetManager(accessToken);

  const [view, setView] = useState<View>('login');

  // 當取得 AccessToken 後自動切換到 Menu，避免卡在 Login 頁
  useEffect(() => {
    if (accessToken && view === 'login') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView('menu');
    }
  }, [accessToken, view]);

  // 監控 Apps Script 啟用狀態，一旦啟用就停止輪詢
  useEffect(() => {
    const intervalId = (window as any)._authCheckInterval;
    if (isAppsScriptEnabled && intervalId) {
      clearInterval(intervalId);
      (window as any)._authCheckInterval = undefined;
    }
    return () => {
       // component unmount 時也要清除，避免記憶體洩漏
       if ((window as any)._authCheckInterval) {
         clearInterval((window as any)._authCheckInterval);
       }
    };
  }, [isAppsScriptEnabled]);

  // 切換 View 時清除相關狀態
  const handleSwitchView = (newView: View) => {
    setView(newView);
    clearError();
    clearTestData();
    clearAuthUrl();
    if (newView === 'menu') {
        // 從其他頁面回到 Menu 時，通常意味著重置某些流程
        resetCreation();
    }
  };

  const currentError = authError || sheetError;

  return (
    <Layout isLoggedIn={!!accessToken}>
      {/* 依據狀態顯示對應 View */}

      {!accessToken ? (
        <LoginView onLogin={login} loading={authLoading} />
      ) : (
        <>
          {/* 1. 檢查 Apps Script API 權限狀態 - Undefined (檢查中) */}
          {isAppsScriptEnabled === undefined && (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <Text>正在確認您的 Google Apps Script 權限...</Text>
            </div>
          )}

          {/* 2. 檢查 Apps Script API 權限狀態 - False (未啟用) -> 顯示警告並阻擋操作 */}
          {isAppsScriptEnabled === false && (
            <div style={{ marginTop: '20px' }}>
              <AuthWarning
                title="請啟用 Google Apps Script API"
                authUrl="https://script.google.com/home/usersettings"
                onOpenAuth={(url) => {
                  window.open(url, '_blank');
                  
                  // 確保先清除可能存在的舊 interval，避免重複輪詢
                  if ((window as any)._authCheckInterval) {
                    clearInterval((window as any)._authCheckInterval);
                  }

                  // 點擊後開始輪詢檢查，每 5 秒一次
                  const intervalId = setInterval(() => {
                    recheckAuth();
                  }, 5000);

                  // 當使用者真的啟用了，這個 component 會 unmount，interval 也會隨之清除
                  (window as any)._authCheckInterval = intervalId;
                }}
              />
              <Callout.Root color="gray" size="1" style={{ marginTop: '10px' }}>
                <Callout.Text>
                  為了能夠自動建立與管理試算表程式，請點擊上方按鈕前往設定頁面，找到 "Google Apps Script API" 設定，將選項由「關閉」切換為「開啟」。
                  系統會自動偵測您的啟用狀態。
                </Callout.Text>
              </Callout.Root>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
                <Button 
                  variant="outline" 
                  color="gray"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                     // 若使用者確認已開啟，讓他們跳過檢查直接進入
                     // 為了安全起見，我們還是會在背景做一次檢查，但不阻擋介面
                     setIsAppsScriptEnabled(true);
                     recheckAuth();
                  }}
                >
                  <CheckCircledIcon />
                  我已經開啟 Apps Script 權限
                </Button>
              </div>
            </div>
          )}

          {/* 3. 檢查 Apps Script API 權限狀態 - True (已啟用) -> 正常顯示功能 */}
          {isAppsScriptEnabled === true && (
            <>
              {view === 'menu' && (
                <MenuView onChangeView={handleSwitchView} />
              )}

              {view === 'create' && (
                <CreateSheetView 
                  loading={sheetLoading}
                  creationStatus={creationStatus}
                  creationResult={creationResult as any}
                  onCreate={createSheet}
                  onBack={() => handleSwitchView('menu')}
                  resetCreation={resetCreation}
                />
              )}

              {view === 'list' && (
                <SheetListView 
                  files={files}
                  loading={sheetLoading}
                  onBack={() => handleSwitchView('menu')}
                  onFetch={fetchFiles}
                  onTestConnection={testConnection}
                  onAddData={addTestData}
                  onUpdateData={updateTestData}
                  onDeleteData={deleteTestData}
                  testData={testData}
                  authUrl={authUrl}
                  onCloseTestResult={() => { clearTestData(); clearAuthUrl(); }}
                />
              )}

              {view === 'remove' && (
                <RemoveView onBack={() => handleSwitchView('menu')} />
              )}
            </>
          )}
        </>
      )}

      {currentError && (
        <Callout.Root color="red" role="alert" style={{ marginTop: '20px' }}>
            <Callout.Icon>
                <ExclamationTriangleIcon />
            </Callout.Icon>
            <Callout.Text style={{ wordBreak: 'break-word' }}>
                {currentError.includes('https://') ? (
                    <span dangerouslySetInnerHTML={{ 
                        __html: currentError.replace(
                            /(https:\/\/[^\s]+)/g, 
                            '<a href="$1" target="_blank" rel="noopener noreferrer" style="text-decoration: underline; font-weight: bold;">$1</a>'
                        ) 
                    }} />
                ) : (
                    currentError
                )}
            </Callout.Text>
        </Callout.Root>
      )}
    </Layout>
  );
};

export default App;
