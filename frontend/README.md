# AutoBizz Web Client

This frontend is now a browser-only web client. It ships as static HTML/CSS/JS in `frontend/web-ui/` and is designed to run in any modern browser, including mobile browsers.

## Prerequisites

- Python 3 (for a simple static file server) or any other static web server
- The AutoBizz backend running locally (default `http://127.0.0.1:5000`)

## Getting started

1. Start the backend (from the repository root):

   ```bash
   python backend/run.py
   ```

2. Serve the static web UI (from the repository root):

   ```bash
   python -m http.server 8080
   ```

3. Open the web UI in your browser:

   <http://localhost:8080/frontend/web-ui/>

## Pointing at a different backend

If your backend is hosted elsewhere, expose the URL before loading the page:

```html
<script>
  window.EXPO_PUBLIC_API_URL = 'https://your-backend.example.com';
</script>
```

You can also store a custom URL in local storage:

```js
localStorage.setItem('apiBaseUrl', 'https://your-backend.example.com');
```

Reload the page after changing the base URL.
