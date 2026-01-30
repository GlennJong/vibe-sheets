import React, { useState } from 'react';
import { Callout, Button, Flex, Text, Spinner } from '@radix-ui/themes';
import { ExclamationTriangleIcon, ExternalLinkIcon } from '@radix-ui/react-icons';

interface AuthWarningProps {
  authUrl: string;
  onOpenAuth: (url: string) => void;
  title?: string;
}

export const AuthWarning: React.FC<AuthWarningProps> = ({ authUrl, onOpenAuth, title }) => {
  const [isWaiting, setIsWaiting] = useState(false);

  const handleClick = () => {
    setIsWaiting(true);
    onOpenAuth(authUrl);
  };

  return (
    <Callout.Root color="amber" variant="surface">
      <Callout.Icon>
        <ExclamationTriangleIcon />
      </Callout.Icon>
      <Callout.Text>
        <Flex direction="column" gap="2">
          <Text weight="bold">{title || '需要授權'}</Text>
          <Text size="2">
            由於這是新產生的 Google Sheets 與 Apps Script，Google 安全機制會要求您必須手動授權一次。
          </Text>
          
          <Button 
            variant="solid" 
            color="amber" 
            onClick={handleClick}
            disabled={isWaiting}
            style={{ cursor: isWaiting ? 'default' : 'pointer', marginTop: '10px' }}
          >
            {isWaiting ? <Spinner loading /> : <ExternalLinkIcon />}
            {isWaiting ? '等待授權中...' : '點此開啟授權視窗'}
          </Button>

          <Text size="1" color="gray">
            1. 彈窗開啟後，請登入您的帳號。<br/>
            2. 點擊 "Review Permissions" 並選擇您的帳號。<br/>
            3. 若出現 "Google hasn't verified this app"，請點擊 Advanced &gt; Go to ... (unsafe)。
          </Text>
        </Flex>
      </Callout.Text>
    </Callout.Root>
  );
};
