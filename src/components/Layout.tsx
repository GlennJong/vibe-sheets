import React from 'react';
import { Container, Flex, Heading, Text, Separator, Box, Badge } from '@radix-ui/themes';
import { CheckCircledIcon } from '@radix-ui/react-icons';

interface LayoutProps {
  children: React.ReactNode;
  isLoggedIn?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ children, isLoggedIn }) => {
  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', width: '100%' }}>
      <Container size="2" p="4">
        <Flex direction="column" gap="4" align="center" mb="6">
          <Heading size="8" align="center" style={{ background: 'linear-gradient(to right, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>
            Vibe Sheets
          </Heading>
          <Text size="3" color="gray" align="center">
            無伺服器資料庫解決方案：Google Sheets + Apps Script
          </Text>
          <Text as="p" size="1" color="gray">
          快速產生具備 JSON API 的試算表，讓前端能夠直接讀取資料。
          </Text>

          {isLoggedIn && (
            <Badge color="green" variant="soft" size="2">
              <Flex align="center" gap="2">
                <CheckCircledIcon />
                已登入 Google 帳號
              </Flex>
            </Badge>
          )}
        </Flex>
        
        <Separator size="4" mb="6" />

        <Flex direction="column" width="100%" gap="4">
          {children}
        </Flex>

        <Box mt="9">
          <Separator size="4" mb="4" />
          <Flex direction="column" gap="2" style={{ opacity: 0.6 }}>
            <Heading size="2" color="gray">⚠️ 免責與隱私聲明</Heading>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--gray-11)', fontSize: '0.8rem' }}>
              <li>
                <Text>
                  本工具旨在加速開發流程，<b>強烈建議僅用於個人專案或原型製作</b>。
                </Text>
              </li>
              <li>
                <Text>
                  Vibe Sheets 採純前端運作，所有溝通直接對接 Google API，<b>絕不會收集或儲存您的任何資料</b>。
                </Text>
              </li>
            </ul>
          </Flex>
        </Box>
      </Container>
    </Flex>
  );
};
