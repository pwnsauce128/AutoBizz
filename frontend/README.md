# AutoBizz Expo client

This directory contains a lightweight Expo/React Native client for interacting with the AutoBizz backend APIs. The application targets Expo Go so you can iterate quickly on iOS, Android or the web.

## Features

- Email/username + password login against `/auth/login` with JWT storage in memory.
- Buyer self-registration through `/auth/register`.
- Active auction feed backed by `/auctions`.
- Auction detail view showing the current best bid and metadata for the selected auction.
- Buyer bid placement through `/auctions/<id>/bids` with inline error handling.

## Prerequisites

- Node.js 18+
- `npm` or `yarn`
- Expo CLI (`npm install -g expo-cli`) if you prefer the global binary
- The AutoBizz backend running locally (default `http://127.0.0.1:5000`)

## Getting started

1. Install dependencies:

   ```bash
   cd frontend
   npm install
   npx expo install react-native-web react-dom @expo/metro-runtime
   ```

2. Optionally configure the backend URL exposed to the Expo client by creating an `.env` file in this folder (make sure to restart `npm start` after changing it). `app.config.js` loads this file via `dotenv` and injects `EXPO_PUBLIC_API_URL` into Expo config so the value is available even when `process.env` is empty inside Metro. If no `.env` is found, the Expo config still exposes `extra.apiUrl` with the default `http://127.0.0.1:5000`:

   ```bash
   echo "EXPO_PUBLIC_API_URL=http://127.0.0.1:5000" > .env
   ```

   When omitted, the app falls back to `http://127.0.0.1:5000`.

   To confirm Metro can see your `.env`, run `npx expo config --json | jq '.extra.apiUrl'` from the `frontend/` folder and verify the output matches your configured URL. If you see the fallback `"http://127.0.0.1:5000"`, Metro did not pick up your `.env`.

   **If `EXPO_PUBLIC_API_URL` shows up as `undefined`, check the following:**

   - Restart Metro with cache cleared (`npx expo start -c`). Environment variables are only read when the bundler starts.
   - Ensure the `.env` file sits directly in the `frontend/` folder (next to `package.json`) and the key is spelled exactly `EXPO_PUBLIC_API_URL` without quotes or spaces.
   - Run `npm run start` from the `frontend/` directory so Expo can see the `.env` file.
   - Confirm the value is also present in Expo config (`Constants.expoConfig.extra.apiUrl`), which is logged on app startup.

3. Start the backend if it is not already running:

   ```bash
   python ../backend/run.py
   ```

4. Launch Expo:

   ```bash
   npm run start
   ```

   Scan the QR code with the Expo Go app or press `w` to open the web preview.

## Standalone web UI

If you want a lightweight browser-only UI that mirrors the Expo web experience, you can use the static web UI in [`frontend/web-ui`](web-ui/README.md). It reuses the same backend endpoints and styling cues as the Expo client, but runs as a simple HTML/CSS/JS app for quick deployments.

## Project structure

```
frontend/
├── App.js                 # Navigation + root provider wiring
├── app.json               # Legacy static Expo configuration (most values live in app.config.js)
├── app.config.js          # Expo configuration with dotenv support for EXPO_PUBLIC_API_URL
├── package.json           # Dependencies and scripts
├── assets/                # Placeholder icons for Expo builds
└── src/
    ├── api/               # Minimal REST client targeting the Flask backend
    ├── components/        # Presentational UI components
    ├── context/           # Auth context keeping JWTs in memory
    ├── screens/           # React Navigation screens
    └── utils/             # Helpers (JWT decoding, etc.)
```

## Authentication notes

The backend returns JWT access/refresh tokens enriched with the user role. The client decodes the access token to determine whether the current user is a buyer so it can enable bid placement. Tokens are kept in memory for simplicity—persist them to secure storage for production usage.

## Extending the app

- Add seller/admin dashboards by branching on the decoded role stored in the auth context.
- Persist JWTs using `expo-secure-store` to keep users logged in between sessions.
- Subscribe to `/notifications` from the backend to surface push updates to buyers and sellers.
