# Vibe Sheets SDK

The official SDK for building applications with Vibe Sheets logic. This SDK provides a decentralized, serverless way to manage Google Sheets and Apps Script deployments directly from the client-side.

## Features

- **Serverless Architecture**: Directly interacts with Google APIs (Sheets, Drive, Apps Script) from the browser.
- **React Hooks**: Built-in hooks for easy state management (`useSheetManager`, `useGoogleAuth`).
- **Core API**: Raw API functions available for non-React environments.
- **Type-Safe**: Written in TypeScript with full type definitions.

## Installation

```bash
npm install @glennjong/vibe-sheets
```

## Usage

### 1. Setup Google Auth

Wrap your application or component functionality with `useGoogleAuth` to handle the OAuth flow.

```tsx
import { ReactHooks } from '@glennjong/vibe-sheets';


const MyComponent = () => {
  const { login, accessToken } = ReactHooks.useGoogleAuth({
    clientId: "YOUR_GOOGLE_CLIENT_ID"
  });

  if (!accessToken) {
    return <button onClick={login}>Login with Google</button>;
  }

  return <VibeApp token={accessToken} />;
};
```

### 2. Manage Sheets

Use `useSheetManager` to create sheets, deploy scripts, and fetch data.

```tsx
import { ReactHooks } from '@glennjong/vibe-sheets';

const VibeApp = ({ token }) => {
  const { 
    createSheet, 
    loading, 
    creationResult 
  } = ReactHooks.useSheetManager(token);

  return (
    <div>
      <button onClick={() => createSheet("My New Sheet")}>
        {loading ? "Creating..." : "Create Vibe Sheet"}
      </button>
      
      {creationResult && (
        <a href={creationResult.spreadsheetUrl}>Open Sheet</a>
      )}
    </div>
  );
};
```

## Core API (Non-React)

If you are not using React, you can import the core functions directly:

```typescript
import { createUserSpreadsheet, createScriptProject } from '@glennjong/vibe-sheets/core';
// Implementation details...
```
