import React from 'react';
import { Card, Flex, Heading, Text, Button } from '@radix-ui/themes';
import { ExternalLinkIcon, ArrowLeftIcon } from '@radix-ui/react-icons';

interface RemoveViewProps {
  onBack: () => void;
}

export const RemoveView: React.FC<RemoveViewProps> = ({ onBack }) => {
  return (
    <div>
      <Flex justify="between" align="center">
        <Heading size="4" style={{ flex: 1, marginRight: '60px' }}>移除權限指南</Heading>
        <Button size="2" variant="ghost" onClick={onBack} style={{ cursor: 'pointer' }}>
          <ArrowLeftIcon /> 返回
        </Button>
      </Flex>
      <Text size="2" color="gray">
        若您決定不再使用本服務，請依序執行以下步驟以確保權限完全移除。
      </Text>

      <Flex direction="column" gap="4" py="4">
        <Flex direction="column" gap="4" mt="2">
          <Card variant="surface">
            <Flex direction="column" gap="3">
                <Heading size="3">步驟 1: 移除您建立的 Apps Script 權限</Heading>
                <Text size="2">
                    請前往 Google 安全性檢查頁面，找到並移除與您建立的 Apps Script 相關的第三方存取權限。
                </Text>
                <Button asChild size="3" variant="soft">
                    <a href="https://myaccount.google.com/security-checkup/3" target="_blank" rel="noopener noreferrer">
                        前往移除 Apps Script 權限 <ExternalLinkIcon />
                    </a>
                </Button>
            </Flex>
          </Card>

          <Card variant="surface">
            <Flex direction="column" gap="3">
                <Heading size="3">步驟 2: 刪除 Google Sheets 表格</Heading>
                <Text size="2">
                    請前往 Google Sheets 管理頁面，手動刪除您不再需要的試算表檔案。
                </Text>
                <Button asChild size="3" variant="soft">
                    <a href="https://docs.google.com/spreadsheets" target="_blank" rel="noopener noreferrer">
                        前往 Google Sheets <ExternalLinkIcon />
                    </a>
                </Button>
            </Flex>
          </Card>

          <Card variant="surface">
            <Flex direction="column" gap="3">
                <Heading size="3">步驟 3: 移除 Vibe Sheets 連結</Heading>
                <Text size="2">
                    請前往 Google 帳戶的「第三方應用程式與服務」頁面，找到 <strong>vibe-sheets</strong> 並取消其與您帳戶的連結。
                </Text>
                <Button asChild size="3" variant="soft">
                    <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">
                        前往移除 Vibe Sheets 連結 <ExternalLinkIcon />
                    </a>
                </Button>
            </Flex>
          </Card>
        </Flex>
      </Flex>
    </div>
  );
};
