# Vibe Sheets (Monorepo)

[Live Demo](https://www.glenn.tw/vibe-sheets)

This repository contains the source code for the Vibe Sheets application and its core SDK.

## Project Structure

- **`app/`**: The frontend application (React + Vite). A fully functional demo that allows you to:
  - Login with Google.
  - Create new "Vibe Sheets" (Spreadsheet + Apps Script API).
  - Manage existing sheets.
  - Test APIs visually (Read, Create, Update, Soft Delete).
  - Upgrade a sheet's Apps Script to the latest version without changing its API URL.
- **`src/`**: The core package (`@glennjong/vibe-sheets`), containing all business logic and Google API interactions.

## Key Capabilities

The generated backend (Apps Script) works as a REST API:
- **CRUD Ready**: Out-of-the-box support for Create, Read, Update, and Delete.
- **Multi-Sheet Support**: Target specific sheets/tabs via API parameters.
- **Smart Fields**: Auto-generated `id`, `created_at`, `updated_at`, also filled in when rows are edited by hand in Google Sheets.
- **Multiple Tabs**: Create several tabs at once with cross-tab `arrayFormula`, validation, read-only and hidden columns.
- **Custom Routes**: Ship your own Apps Script code and expose it via `?action=<name>`.
- **Safe Writes**: Create is idempotent by `id` and writes are serialized, so retries don't duplicate rows.
- **In-place Upgrades**: `upgradeScript` updates the existing deployment, so the API URL stays the same.
- **Soft Deletion**: Records are marked as `is_enabled: false` instead of being physically removed.
- **Dynamic UI**: Boolean fields are automatically rendered as Checkboxes in Google Sheets.
- **One-click Authorization**: Open `?action=authorize` (`getAuthorizeUrl(scriptUrl)`) for the owner's first-time authorization.
- **API Testing**: The demo app includes a built-in API tester with field filtering.

See [`src/README.md`](src/README.md) for the full SDK reference.

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Setup Environment Variables**
   Create a `.env` file in the root directory (copy from `.env.example`):
   ```
   VITE_GOOGLE_CLIENT_ID=your_google_client_id
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```
   This will start the React application at `http://localhost:5173`.

## Architecture

This project follows a **decentralized, serverless** philosophy. 
- No backend server is required.
- The SDK directly communicates with Google APIs using the user's OAuth token.
- All "backend" logic (like creating Apps Script projects) runs in the user's browser via the SDK.

## Developing the SDK

The SDK logic resides in the `src` folder. The `app` folder directly imports from `../src`, so any changes you make in `src` will be immediately reflected in the running app (Hot Module Replacement supported).
