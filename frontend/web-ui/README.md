# AutoBizz Web UI

This folder contains a standalone HTML/CSS/JS web client that mirrors the Expo web experience. It supports the same roles and workflows (buyer browsing/bidding, seller management, and admin user control) against the existing Flask backend.

## Quick start

1. Ensure the backend is running (default `http://127.0.0.1:5000`).
2. Serve this folder with any static file server. For example, from the repository root:

   ```bash
   python -m http.server 8080
   ```

3. Open <http://localhost:8080/frontend/web-ui/> in your browser.

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
