import React, { useState } from 'react';
import { Card, Flex, Button, Heading, Text, TextField, Callout } from '@radix-ui/themes';
import { ExternalLinkIcon, CheckCircledIcon, ExclamationTriangleIcon, UpdateIcon, CircleIcon } from '@radix-ui/react-icons';
import { openAuthPopup } from '../utils';

export interface CreationResponse {
  spreadsheetUrl: string;
  scriptUrl: string;
}

export type CreationStatus = 'idle' | 'creating_sheet' | 'creating_script' | 'updating_script' | 'deploying' | 'finishing' | 'completed';

interface CreateSheetViewProps {
  loading: boolean;
  creationStatus: CreationStatus;
  creationResult: CreationResponse | null;
  onCreate: (options: { sheetName: string, tabName?: string }) => void;
  onBack: () => void;
  resetCreation: () => void;
}

const StepItem = ({ label, status }: { label: string, status: 'pending' | 'in-progress' | 'done' }) => {
    let icon = <CircleIcon />;
    let color: "gray" | "blue" | "green" = "gray";
  
    if (status === 'in-progress') {
      icon = <UpdateIcon style={{ animation: 'spin 1s linear infinite' }} />;
      color = "blue";
    } else if (status === 'done') {
      icon = <CheckCircledIcon />;
      color = "green";
    }
  
    return (
      <Flex gap="2" align="center">
        <Text color={color}>{icon}</Text>
        <Text color={color} size="2">{label}</Text>
      </Flex>
    );
  }

export const CreateSheetView: React.FC<CreateSheetViewProps> = ({ 
  loading,
  creationStatus, 
  creationResult, 
  onCreate, 
  onBack,
  resetCreation 
}) => {
  const [sheetName, setSheetName] = useState('');
  const [tabName] = useState('');

  if (creationResult) {
    return (
      <Card size="3" style={{ width: '100%' }}>
        <Flex direction="column" gap="4" align="center" py="4">
          <CheckCircledIcon width="48" height="48" color="green" />
          <Heading size="5">部署完成！</Heading>
          <Text size="2" color="gray">您的表格與連動腳本已建立。</Text>
          
          <Callout.Root color="amber">
            <Callout.Icon>
              <ExclamationTriangleIcon />
            </Callout.Icon>
            <Callout.Text>
              <Text weight="bold" as="div" mb="2">重要：最後一步</Text>
              <Text size="2">
                請授權您自己的 Apps Script (APIs) 來控制您的 Google Sheets。此工具完全運行在您的帳號下，您擁有絕對的主導權。
              </Text>
              <Button 
                onClick={() => creationResult.scriptUrl && openAuthPopup(creationResult.scriptUrl)}
                color="amber"
                variant="solid"
                mt="3"
                style={{ width: '100%', cursor: 'pointer' }}
              >
                <ExternalLinkIcon /> 點此開啟授權彈窗
              </Button>
            </Callout.Text>
          </Callout.Root>

          <Flex gap="3" width="100%" mt="2">
            <Button 
              asChild 
              variant="outline" 
              style={{ flex: 1, cursor: 'pointer' }}
            >
              <a href={creationResult.spreadsheetUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon /> 開啟 Google 試算表
              </a>
            </Button>
          </Flex>

          <Button 
            onClick={() => { resetCreation(); onBack(); }} 
            variant="ghost"
            style={{ cursor: 'pointer' }}
          >
            返回選單
          </Button>
        </Flex>
      </Card>
    );
  }

  const isSheetDone = !['idle', 'creating_sheet'].includes(creationStatus);
  const sheetStatus = creationStatus === 'creating_sheet' ? 'in-progress' : (isSheetDone ? 'done' : 'pending');

  const scriptStatus = ['creating_script', 'updating_script', 'deploying', 'finishing'].includes(creationStatus) 
     ? 'in-progress' 
     : (creationStatus === 'completed' ? 'done' : 'pending');

  return (
    <Card size="3" style={{ width: '100%' }}>
      <Flex direction="column" gap="4" py="4">
        <Heading size="4">新增表格</Heading>
        
        <Flex direction="column" gap="2">
            <Text size="2" weight="bold">表格名稱</Text>
            <TextField.Root 
                placeholder="請輸入名稱" 
                disabled={loading}
                value={sheetName} 
                onChange={(e) => setSheetName(e.target.value)}
            >
                <TextField.Slot>
                    vibesheet-
                </TextField.Slot>
            </TextField.Root>
        </Flex>

        {loading && (
            <Flex direction="column" gap="2" my="2" p="3" style={{ background: 'var(--gray-3)', borderRadius: 'var(--radius-2)' }}>
                <StepItem label={sheetStatus === 'done' ? "已新增 Google Sheet" : `正在您的 Google Sheet 新增試算表: ${sheetName}...`} status={sheetStatus} />
                <StepItem label={scriptStatus === 'done' ? "已新增 Apps Script" : "正在您的 Apps Script 新增 APIs..."} status={scriptStatus} />
            </Flex>
        )}

        <Flex gap="3" mt="4">
          <Button 
            onClick={() => onCreate({ sheetName, tabName: tabName.trim() || undefined })} 
            disabled={loading || !sheetName.trim()} 
            style={{ flex: 1, cursor: 'pointer' }}
          >
            {loading ? '建立中...' : '建立'}
          </Button>
          <Button 
            onClick={onBack} 
            disabled={loading}
            variant="soft" 
            color="gray"
            style={{ flex: 1, cursor: 'pointer' }}
          >
            取消
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
};
