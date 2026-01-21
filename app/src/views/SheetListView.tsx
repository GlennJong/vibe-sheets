import React, { useEffect, useState } from 'react';
import { Card, Flex, Button, Heading, Text, ScrollArea, Box, Code, Dialog, TextField } from '@radix-ui/themes';
import { ExternalLinkIcon, ArrowLeftIcon, LightningBoltIcon, Cross2Icon, MagnifyingGlassIcon } from '@radix-ui/react-icons';
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

export const SheetListView: React.FC<SheetListViewProps> = ({  
  files, 
  loading, 
  onBack, 
  onFetch,
  onTestConnection,
  onAddData,
  onUpdateData,
  onDeleteData,
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
