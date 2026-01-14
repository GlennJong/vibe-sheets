import React from 'react';
import { Card, Flex, Button, Text } from '@radix-ui/themes';

interface LoginViewProps {
  onLogin: () => void;
  loading: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin, loading }) => {
  return (
    <Card size="3">
      <Flex direction="column" gap="4" align="center" py="4">
        <Text size="5" weight="bold">歡迎使用</Text>
        <Text size="2" color="gray" align="center">
            請授權以存取您的 Google Drive<br/>以便建立與管理試算表
        </Text>
        <Button 
          onClick={onLogin} 
          disabled={loading}
          size="3"
          style={{ cursor: 'pointer', width: '100%' }}
        >
          {loading ? '正在處理中...' : '登入 Google'}
        </Button>
      </Flex>
    </Card>
  );
};
