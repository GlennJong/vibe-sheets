import React, { useEffect, useState } from 'react';
import { Card, Flex, Button, Heading, Text, ScrollArea, Box, Code, Dialog, TextField } from '@radix-ui/themes';
import { ExternalLinkIcon, ArrowLeftIcon, LightningBoltIcon, Cross2Icon, MagnifyingGlassIcon, UpdateIcon } from '@radix-ui/react-icons';
import type { DriveFile } from '../types';
import { AuthWarning } from '../components/AuthWarning';
import { openAuthPopup, getScriptUrlFromDescription } from '../utils';

interface SheetListViewProps {
  files: DriveFile[];
  loading: boolean;
  onBack: () => void;
  onFetch: () => void;
  onTestConnection: (file: DriveFile, fields?: string) => void;
  onAddData: (file: DriveFile, count: number) => void;
  onUpdateData: (file: DriveFile, targetId?: string) => void;
  onDeleteData: (file: DriveFile, targetId?: string) => void;
  onUpgradeScript: (file: DriveFile) => Promise<unknown>;
  testData: string;
  authUrl: string;
  onCloseTestResult: () => void;
}

const ApiActionDialog: React.FC<{ 
    trigger: React.ReactNode; 
    title: string; 
    method: string; 
    url: string; 
    body?: any;
    isGet?: boolean;
    onSend: (params?: any) => void; 
}> = ({ trigger, title, method, url, body, isGet, onSend }) => {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState('');
  const [targetId, setTargetId] = useState('');

  const isPut = url.includes('method=PUT');
  const isDelete = url.includes('method=DELETE');
  const showIdInput = isPut || isDelete; // Show input for both PUT and DELETE

  const displayUrl = isGet && fields.trim() 
    ? `${url}${url.includes('?') ? '&' : '?'}fields=${encodeURIComponent(fields.trim())}`
    : url;

  const displayBody = React.useMemo(() => {
    if (!body) return undefined;
    if (showIdInput && targetId) {
        return { ...body, id: targetId };
    }
    return body;
  }, [body, showIdInput, targetId]);

  const handleSend = () => {
    if (isGet) {
        onSend(fields);
    } else if (showIdInput) {
        onSend(targetId);
    } else {
        onSend();
    }
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>{trigger}</Dialog.Trigger>
      <Dialog.Content maxWidth="500px">
        <Dialog.Title size="3">{title}</Dialog.Title>
        
        <Flex direction="column" gap="3" mt="3">
          <Box>
              <Text size="2" weight="bold" color="gray">Method</Text>
              <Flex align="center" gap="2" mt="1">
                  <Code variant="solid" color={method === 'GET' ? 'blue' : 'green'}>{method}</Code>
              </Flex>
          </Box>

          <Box>
              <Text size="2" weight="bold" color="gray">URL</Text>
              <Box mt="1" p="2" style={{ background: 'var(--gray-3)', borderRadius: 'var(--radius-2)', wordBreak: 'break-all' }}>
                  <Code variant="ghost" size="1">{displayUrl}</Code>
              </Box>
          </Box>

          {isGet && (
              <Box>
                  <Text size="2" weight="bold" color="gray">Fields Filter (Optional)</Text>
                  <Box mt="1">
                    <TextField.Root 
                        placeholder="e.g. name,value" 
                        value={fields}
                        onChange={(e) => setFields(e.target.value)}
                    >
                        <TextField.Slot>
                            <MagnifyingGlassIcon height="16" width="16" />
                        </TextField.Slot>
                    </TextField.Root>
                    <Text size="1" color="gray" mt="1" style={{ display: 'block' }}>
                        輸入欲回傳的欄位，留空則回傳全部
                    </Text>
                  </Box>
              </Box>
          )}

          {showIdInput && (
              <Box>
                  <Text size="2" weight="bold" color="gray">Target ID (Optional)</Text>
                  <Box mt="1">
                    <TextField.Root 
                        placeholder="Paste target ID here (Leave empty to auto-pick)" 
                        value={targetId}
                        onChange={(e) => setTargetId(e.target.value)}
                    >
                        <TextField.Slot>
                            <MagnifyingGlassIcon height="16" width="16" />
                        </TextField.Slot>
                    </TextField.Root>
                    <Text size="1" color="gray" mt="1" style={{ display: 'block' }}>
                        指定要操作的 ID。若留空，將由系統自動選取一筆測試。
                    </Text>
                  </Box>
              </Box>
          )}

          {displayBody && (
              <Box>
                  <Text size="2" weight="bold" color="gray">{showIdInput ? "Request Body Preview" : "Request Body Example"}</Text>
                  <Box mt="1" p="2" style={{ background: 'var(--gray-3)', borderRadius: 'var(--radius-2)' }}>
                      <Code variant="ghost" size="1" style={{ whiteSpace: 'pre-wrap', display: 'block' }}>
                          {JSON.stringify(displayBody, null, 2)}
                      </Code>
                  </Box>
              </Box>
          )}
        </Flex>

        <Flex justify="end" gap="3" mt="4">
          <Dialog.Close>
              <Button variant="soft" color="gray" style={{ cursor: 'pointer' }}>Cancel</Button>
          </Dialog.Close>
          <Button onClick={handleSend} style={{ cursor: 'pointer' }}>
              <LightningBoltIcon /> Send Request
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

const UpgradeScriptDialog: React.FC<{
    file: DriveFile;
    onUpgrade: (file: DriveFile) => Promise<unknown>;
}> = ({ file, onUpgrade }) => {
  const [open, setOpen] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [done, setDone] = useState(false);

  // 帶自訂腳本 (scriptVersion) 的表格由 SDK 建立，從 demo 升級會覆蓋掉 Custom.gs
  const disabledReason = !file.scriptId
    ? '找不到 scriptId，無法升級'
    : file.scriptVersion
      ? `此表格使用自訂腳本 (${file.scriptVersion})，請用 SDK 的 upgradeScript 帶入原本的 script 升級`
      : '';

  const handleOpenChange = (next: boolean) => {
    if (upgrading) return;
    setOpen(next);
    if (!next) setDone(false);
  };

  const handleUpgrade = async () => {
    setUpgrading(true);
    const result = await onUpgrade(file);
    setUpgrading(false);
    if (result) {
      setDone(true);
    } else {
      setOpen(false); // 失敗訊息由頁面下方的錯誤區塊顯示
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger>
        <Button
            size="2"
            variant="soft"
            color="gray"
            disabled={!!disabledReason}
            title={disabledReason || '將 Apps Script 更新為最新版本'}
            style={{ cursor: disabledReason ? 'not-allowed' : 'pointer' }}
        >
            <UpdateIcon /> 升級腳本
        </Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="450px">
        <Dialog.Title size="3">升級 Apps Script</Dialog.Title>
        {done ? (
          <Dialog.Description size="2">
            已將「{file.name}」的腳本升級為最新版本，API URL 維持不變。
          </Dialog.Description>
        ) : (
          <Dialog.Description size="2">
            將「{file.name}」的 Apps Script 替換為最新版本並更新現有部署，API URL 不會改變。
            若您曾手動修改過 Code.gs，修改內容會被覆蓋。
          </Dialog.Description>
        )}

        <Flex justify="end" gap="3" mt="4">
          {done ? (
            <Dialog.Close>
                <Button style={{ cursor: 'pointer' }}>完成</Button>
            </Dialog.Close>
          ) : (
            <>
              <Dialog.Close>
                  <Button variant="soft" color="gray" disabled={upgrading} style={{ cursor: 'pointer' }}>取消</Button>
              </Dialog.Close>
              <Button onClick={handleUpgrade} loading={upgrading} style={{ cursor: 'pointer' }}>
                  <UpdateIcon /> 升級
              </Button>
            </>
          )}
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export const SheetListView: React.FC<SheetListViewProps> = ({  
  files, 
  loading, 
  onBack, 
  onFetch,
  onTestConnection,
  onAddData,
  onUpdateData,
  onDeleteData,
  onUpgradeScript,
  testData,
  authUrl,
  onCloseTestResult
}) => {
  // Global filter removed
  
  useEffect(() => {
    onFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Flex direction="column" gap="4" width="100%">
      
      <Flex justify="between" align="center">
        <Heading size="4">您的表格 (vibesheet-*)</Heading>
        <Button size="2" variant="ghost" onClick={onBack} style={{ cursor: 'pointer' }}>
          <ArrowLeftIcon /> 返回
        </Button>
      </Flex>
      
      {/* Test Data Display */}
      {testData && (
        <Card size="2" style={{ backgroundColor: 'var(--gray-2)' }}>
          <Flex justify="between" align="center" mb="2">
            <Text weight="bold" size="2">測試連線回傳資料</Text>
            <Button size="1" variant="ghost" onClick={onCloseTestResult} style={{ cursor: 'pointer' }}>
              <Cross2Icon /> 關閉
            </Button>
          </Flex>
          <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: 200 }}>
            <Box p="2" style={{ backgroundColor: 'var(--gray-3)', borderRadius: 'var(--radius-2)' }}>
              <Code variant="ghost" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {testData}
              </Code>
            </Box>
          </ScrollArea>
        </Card>
      )}

      {authUrl && (
        <AuthWarning authUrl={authUrl} onOpenAuth={openAuthPopup} />
      )}

      {loading && !testData ? (
        <Flex justify="center" p="4">
            <Text>載入中...</Text>
        </Flex>
      ) : (
        <Flex direction="column" gap="3">
          {files.length === 0 ? (
            <Text align="center" color="gray">沒有找到相關表格</Text>
          ) : (
            files.map(file => {
               const rawScriptUrl = getScriptUrlFromDescription(file.description);
               // Mock URLs for display if missing
               const scriptUrl = rawScriptUrl || 'https://script.google.com/macros/s/.../exec';
               
               return (
                <Card key={file.id} size="2">
                    <Flex justify="between" align="center" wrap="wrap" gap="2">
                    <Flex direction="column" gap="1">
                         <Flex align="center" gap="2">
                            <Text weight="bold">{file.name}</Text>
                            <Button 
                                size="1" 
                                variant="ghost" 
                                asChild
                                title="Open Sheet"
                                style={{ cursor: 'pointer' }}
                            >
                                <a href={file.webViewLink} target="_blank" rel="noopener noreferrer">
                                    <ExternalLinkIcon />
                                </a>
                            </Button>
                        </Flex>
                        <Text size="1" color="gray">ID: {file.id.substring(0, 10)}...</Text>
                    </Flex>
                    
                    <Flex gap="3" align="center" wrap="wrap">
                        {/* GET */}
                        <ApiActionDialog 
                            trigger={
                                <Button size="2" variant="soft" style={{ cursor: 'pointer' }}>
                                    <LightningBoltIcon /> 讀取
                                </Button>
                            }
                            title="API: Read List"
                            method="GET"
                            url={scriptUrl}
                            isGet={true}
                            onSend={(fields) => onTestConnection(file, fields)}
                        />

                        {/* CREATE */}
                        <ApiActionDialog 
                            trigger={
                                <Button size="2" variant="soft" color="cyan" style={{ cursor: 'pointer' }}>
                                    <LightningBoltIcon /> 新增
                                </Button>
                            }
                            title="API: Create Item"
                            method="POST"
                            url={scriptUrl}
                            body={[{ name: "Test Item...", value: 123 }]}
                            onSend={() => onAddData(file, 1)}
                        />

                        {/* UPDATE */}
                        <ApiActionDialog 
                            trigger={
                                <Button size="2" variant="soft" color="plum" style={{ cursor: 'pointer' }}>
                                    <LightningBoltIcon /> 更新
                                </Button>
                            }
                            title="API: Update Item"
                            method="POST"
                            url={`${scriptUrl}?method=PUT`}
                            body={{ id: "<target_id>", name: "Updated...", value: 456 }}
                            onSend={(id) => onUpdateData(file, id)}
                        />
                        
                        {/* DELETE */}
                        <ApiActionDialog 
                            trigger={
                                <Button size="2" variant="soft" color="red" style={{ cursor: 'pointer' }}>
                                    <LightningBoltIcon /> 刪除
                                </Button>
                            }
                            title="API: Delete Item"
                            method="POST"
                            url={`${scriptUrl}?method=DELETE`}
                            body={{ id: "<target_id>" }}
                            onSend={() => onDeleteData(file)} // If you supported DELETE: onSend={(id) => onDeleteData(file, id)}
                        />

                        <UpgradeScriptDialog file={file} onUpgrade={onUpgradeScript} />
                    </Flex>
                    </Flex>
                </Card>
               );
            })
          )}
        </Flex>
      )}
    </Flex>
  );
};
