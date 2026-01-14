# Vibe Sheets (Monorepo)

This repository contains the source code for the Vibe Sheets application and its core SDK.

## Project Structure

- **`app/`**: The frontend application (React + Vite).
- **`src/`**: The core package (`@glennjong/vibe-sheets`), containing all business logic and Google API interactions.

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
