import React, { useState, useEffect } from 'react';
import { Callout } from '@radix-ui/themes';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';

import { useGoogleAuth } from './hooks/useGoogleAuth';
import { useSheetManager } from './hooks/useSheetManager';

import { Layout } from './components/Layout';
import { LoginView } from './views/LoginView';
import { MenuView } from './views/MenuView';
import { CreateSheetView } from './views/CreateSheetView';
import { SheetListView } from './views/SheetListView';

const App: React.FC = () => {
  const { accessToken, login, loading: authLoading, error: authError } = useGoogleAuth();
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
    resetCreation,
    clearTestData,
    clearError,
    clearAuthUrl
  } = useSheetManager(accessToken);

  const [view, setView] = useState<'login' | 'menu' | 'create' | 'list'>('login');

  // 當取得 AccessToken 後自動切換到 Menu，避免卡在 Login 頁
  useEffect(() => {
    if (accessToken && view === 'login') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView('menu');
    }
  }, [accessToken, view]);

  // 切換 View 時清除相關狀態
  const handleSwitchView = (newView: 'login' | 'menu' | 'create' | 'list') => {
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
          {view === 'menu' && (
            <MenuView onChangeView={handleSwitchView} />
          )}

          {view === 'create' && (
            <CreateSheetView 
              loading={sheetLoading}
              creationResult={creationResult}
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
              testData={testData}
              authUrl={authUrl}
              onCloseTestResult={() => { clearTestData(); clearAuthUrl(); }}
            />
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
