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

## Apps Script Backend

The SDK automatically deploys a Google Apps Script project that acts as a RESTful API for your Google Sheets.

### Supported Operations

All operations support the `sheet` query parameter (e.g., `?sheet=PendingOrders`).
- If specified, the operation targets that specific sheet/tab by name.
- If omitted, defaults to the **first sheet** in the spreadsheet.

- **GET (Read)**: Fetches data from the sheet.
  - Supports field filtering: `?fields=field1,field2`
  - Automatically filters out soft-deleted items (`is_enabled=false`).
  - Excludes system columns (`is_enabled`) from default response.

- **POST (Create)**: Appends new rows to the sheet.
  - Supports batch insertion (array of objects) or single item.
  - Automatically sets `created_at`, `updated_at`, and `id` (UUID).
  - Handles Checkbox data validation dynamically.

- **POST (Update)**: Updates existing rows.
  - Method: `?method=PUT`
  - Body: `{ id: "target_id", ...fields_to_update }`
  - Automatically updates `updated_at`.

- **POST (Delete)**: Soft deletes rows.
  - Method: `?method=DELETE`
  - Body: `{ id: "target_id" }`
  - Sets `is_enabled` to `false`.

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
