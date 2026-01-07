import React, { useEffect, useState } from 'react';
import { Card, Flex, Button, Heading, Text, ScrollArea, Box, Code, Dialog } from '@radix-ui/themes';
import { ExternalLinkIcon, ArrowLeftIcon, LightningBoltIcon, Cross2Icon, ClipboardCopyIcon, CheckCircledIcon } from '@radix-ui/react-icons';
import type { DriveFile } from '../types';
import { AuthWarning } from '../components/AuthWarning';
import { openAuthPopup, getScriptUrlFromDescription } from '../utils';

interface SheetListViewProps {
  files: DriveFile[];
  loading: boolean;
  onBack: () => void;
  onFetch: () => void;
  onTestConnection: (file: DriveFile) => void;
  testData: string;
  authUrl: string;
  onCloseTestResult: () => void;
}

export const SheetListView: React.FC<SheetListViewProps> = ({ 
  files, 
  loading, 
  onBack, 
  onFetch,
  onTestConnection,
  testData,
  authUrl,
  onCloseTestResult
}) => {
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  
  useEffect(() => {
    onFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopyUrl = (file: DriveFile) => {
    const url = getScriptUrlFromDescription(file.description);
    if (url) {
        navigator.clipboard.writeText(url).then(() => {
            setShowCopyDialog(true);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            // Fallback for failure can still be an alert lightly, or we can add an error state
            alert("複製失敗，請手動複製");
        });
    }
  };

  return (
    <Flex direction="column" gap="4" width="100%">
      
      {/* Success Dialog */}
      <Dialog.Root open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <Dialog.Content maxWidth="450px">
          <Dialog.Title>
            <Flex align="center" gap="2">
              <CheckCircledIcon color="green" width="24" height="24" />
              拷貝成功
            </Flex>
          </Dialog.Title>
          <Dialog.Description size="2" mb="4">
            <Text size="3" color="gray" align="center">
              現在你可以透過這個 url 取得 JSON data！祝開發愉快！
            </Text>
            <br />
            <Text size="1" color="red" align="center">
              注意：請勿將此連結分享給其他人，任何人都將可以透過此 url 取得你的資料！
            </Text>
          </Dialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray" style={{ cursor: 'pointer' }}>
                關閉
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      <Flex justify="between" align="center">
        <Heading size="4">您的表格 (vibesheet-*)</Heading>
        <Button size="2" variant="ghost" onClick={onBack} style={{ cursor: 'pointer' }}>
          <ArrowLeftIcon /> 返回
        </Button>
      </Flex>
      
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
               const hasScript = !!getScriptUrlFromDescription(file.description);
               return (
                <Card key={file.id} size="2">
                    <Flex justify="between" align="center" wrap="wrap" gap="2">
                    <Flex direction="column" gap="1">
                        <Text weight="bold">{file.name}</Text>
                        <Text size="1" color="gray">ID: {file.id.substring(0, 10)}...</Text>
                    </Flex>
                    
                    <Flex gap="2">
                        {hasScript && (
                            <Button
                                size="2"
                                variant="soft"
                                color="orange"
                                onClick={() => handleCopyUrl(file)}
                                style={{ cursor: 'pointer' }}
                            >
                                <ClipboardCopyIcon /> 拷貝 URL
                            </Button>
                        )}

                        <Button 
                            size="2" 
                            variant="soft" 
                            onClick={() => onTestConnection(file)}
                            style={{ cursor: 'pointer' }}
                        >
                            <LightningBoltIcon /> 測試
                        </Button>
                        <Button 
                            size="2" 
                            variant="outline" 
                            asChild
                            style={{ cursor: 'pointer' }}
                        >
                            <a href={file.webViewLink} target="_blank" rel="noopener noreferrer">
                                <ExternalLinkIcon /> 開啟
                            </a>
                        </Button>
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
