# Vibe Sheets SDK

[Live Demo](https://www.glenn.tw/vibe-sheets) | [GitHub Repository](https://github.com/GlennJong/vibe-sheets)

The official SDK for building applications with Vibe Sheets logic. This SDK provides a decentralized, serverless way to manage Google Sheets and Apps Script deployments directly from the client-side.

## Features

- **Serverless Architecture**: Directly interacts with Google APIs (Sheets, Drive, Apps Script) from the browser.
- **Full CRUD Support**: Built-in support for Create, Read, Update, and Delete operations on Google Sheets.
- **Soft Delete**: Implements soft delete pattern using `is_enabled` column.
- **Advanced Filtering**: Support for field projection (e.g., `?fields=name,value`) in API requests.
- **React Hooks**: Built-in hooks for easy state management (`useSheetManager`, `useGoogleAuth`).
- **Core API**: Raw API functions available for non-React environments.
- **Type-Safe**: Written in TypeScript with full type definitions.

## React Hooks Usage

The SDK provides ready-to-use React hooks to simplify integration.

### `useGoogleAuth`

Handles Google OAuth 2.0 authentication flow, permission scopes, and token management.

```typescript
import { ReactHooks } from '@glennjong/vibe-sheets';

const MyComponent = () => {
  const { 
    tokenClient,
    accessToken,
    loading,
    error,
    isAppsScriptEnabled,
    isChecking,
    initGoogleAuth,
    handleLogin,
    handleLogout,
    checkAppsScriptStatus,
    enableAppsScriptApi
  } = ReactHooks.useGoogleAuth({
    clientId: "YOUR_GOOGLE_CLIENT_ID"
  });

  useEffect(() => {
    initGoogleAuth();
  }, [initGoogleAuth]);

  if (!accessToken) {
    return <button onClick={handleLogin}>Login with Google</button>;
  }

  return (
    <div>
      <p>Logged in!</p>
      {/* Check if user needs to enable Apps Script API manually */}
      {isChecking ? "Checking API status..." : (
         isAppsScriptEnabled === false && (
            <button onClick={enableAppsScriptApi}>Enable Apps Script API</button>
         )
      )}
    </div>
  );
};
```

### `useSheetManager`

Manages the lifecycle of Vibe Sheets: creating new sheets, deploying the backend script, and fetching the list of existing sheets.

```typescript
import { ReactHooks } from '@glennjong/vibe-sheets';

const Dashboard = ({ accessToken }) => {
  const {
    loading,
    error,
    files,          // List of Vibe Sheet files (DriveFile[])
    creationStatus, // 'idle' | 'creating_sheet' | 'creating_script' | ...
    creationResult, // Result after successful creation
    fetchFiles,
    createSheet,
    testConnection
  } = ReactHooks.useSheetManager(accessToken);

  // 1. Fetch existing sheets on load
  useEffect(() => {
    if (accessToken) fetchFiles();
  }, [accessToken]);

  // 2. Create a new sheet
  const handleCreate = async () => {
    await createSheet({
      sheetName: "My New Database",
      columns: [
        { name: 'product', type: 'string' },
        { name: 'price', type: 'number' },
        { name: 'in_stock', type: 'boolean' }
      ]
    });
  };

  return (
    <div>
      {loading && <p>Loading...</p>}
      {error && <p style={{color: 'red'}}>{error}</p>}
      
      <button onClick={handleCreate}>Create New Sheet</button>

      <ul>
        {files.map(file => (
          <li key={file.id}>
            {file.name} 
            {file.isError ? (
               <span style={{color: 'red'}}> (Invalid Config)</span>
            ) : (
               <button onClick={() => testConnection(file)}>Test API</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
```

## Apps Script Backend

The SDK automatically deploys a Google Apps Script project that acts as a RESTful API for your Google Sheets.

### Supported Operations

All operations support the `sheet` query parameter (e.g., `?sheet=PendingOrders`).
- If specified, the operation targets that specific sheet/tab by name.
- If omitted, defaults to the **first sheet** in the spreadsheet.

- **GET (Read)**: Retrieves rows from the sheet.
  - **Query Params**:
    - `sheet` (Optional): The name of the tab to read from(e.g., `?sheet=mySheet`). Defaults to the first tab.
    - `fields` (Optional): Comma-separated list of columns to retrieve (e.g., `?fields=name,email`).
  - **Behavior**:
    - Automatically filters out rows where `is_enabled` is `false` (soft delete).
    - **Always returns the `id` column**, even if not explicitly requested in `fields`.
    - Excludes `is_enabled` from the response unless explicitly asked for.

- **POST (Create)**: Appends new rows to the sheet.
  - **Query Params**:
    - `sheet` (Optional): The name of the tab to read from(e.g., `?sheet=mySheet`). Defaults to the first tab.
  - **Body**: Single JSON object or an Array of objects.
  - **Behavior**:
    - This is the default action if no `method` parameter is provided.
    - Auto-generates `id` (UUID) as a **string**, `created_at`, and `updated_at` if missing.
    - Automatically adds checkbox validation for boolean fields.

- **POST (Update)**: Updates specific columns of an existing row.
  - **Query Params**:
    - `method=PUT` (Required): Specifies the update operation.
    - `sheet` (Optional): The name of the tab to read from(e.g., `?sheet=mySheet`). Defaults to the first tab.
  - **Body**: JSON object `{ id: "target_id", ...fields_to_update }`.
  - **Behavior**:
    - Matches row by `id` (string comparison).
    - Updates only the provided fields and refreshes `updated_at`.

- **POST (Delete)**: Performs a soft delete.
  - **Query Params**:
    - `method=DELETE` (Required): Specifies the delete operation.
    - `sheet` (Optional): The name of the tab to read from(e.g., `?sheet=mySheet`). Defaults to the first tab.
  - **Body**: JSON object `{ id: "target_id" }`.
  - **Behavior**:
    - Sets `is_enabled` to `false`.
    - Does not physically delete the row.

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

  const handleCreate = () => {
    createSheet({
        sheetName: "My New Sheet",
        // Optional: Custom tab Name (defaults to 'default')
        tabName: "OrderData",
        // Optional: Custom prefix for file search (defaults to 'vibesheet-')
        prefix: "myapp-",
        // Optional: Define custom columns (defaults to name/value)
        columns: [
            { name: "title", type: "string" },
            { name: "status", type: "string" },
            { name: "count", type: "number" }
        ]
    });
  };

  return (
    <div>
      <button onClick={handleCreate}>
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
