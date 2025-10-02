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
   ```

2. Optionally configure the backend URL exposed to the Expo client by creating an `.env` file in this folder:

   ```bash
   echo "EXPO_PUBLIC_API_URL=http://127.0.0.1:5000" > .env
   ```

   When omitted, the app falls back to `http://127.0.0.1:5000`.

3. Start the backend if it is not already running:

   ```bash
   python ../backend/run.py
   ```

4. Launch Expo:

   ```bash
   npm run start
   ```

   Scan the QR code with the Expo Go app or press `w` to open the web preview.

## Project structure

```
frontend/
├── App.js                 # Navigation + root provider wiring
├── app.json               # Expo configuration
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
