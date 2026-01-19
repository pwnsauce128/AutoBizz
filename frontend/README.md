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

## Production hosting (TLS + reverse proxy)

Gunicorn should run the Flask backend only. In production, serve the static UI with a web server/reverse proxy (Nginx, Caddy, Apache) and terminate TLS there. The proxy can serve `frontend/web-ui/` as static files and forward API requests (for example `/api`) to `http://127.0.0.1:8000`.

If you have TLS certificates in `backend/certs`, reference those certificate paths from your proxy config (or move them to the location your proxy expects). Example Nginx configuration (paths are illustrative):

```nginx
server {
  listen 443 ssl;
  server_name your-domain.example;

  ssl_certificate     /home/debian/AutoBizz/backend/certs/server.crt;
  ssl_certificate_key /home/debian/AutoBizz/backend/certs/server.key;

  root /home/debian/AutoBizz/frontend/web-ui;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:8000/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

### Nginx setup steps (Debian/Ubuntu)

1. Install Nginx (if needed):

   ```bash
   sudo apt-get update
   sudo apt-get install -y nginx
   ```

2. Create a site config file, for example:

   ```bash
   sudo nano /etc/nginx/sites-available/autobizz
   ```

3. Paste the `server { ... }` block above, and replace:
   - `server_name` with your domain.
   - `ssl_certificate`/`ssl_certificate_key` with your actual cert paths.
   - `root` with the absolute path to `frontend/web-ui`.

4. Enable the site and disable the default (optional but common):

   ```bash
   sudo ln -s /etc/nginx/sites-available/autobizz /etc/nginx/sites-enabled/autobizz
   sudo rm -f /etc/nginx/sites-enabled/default
   ```

5. Check the config and reload Nginx:

   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

6. Ensure Gunicorn is running on `http://127.0.0.1:8000` so `/api/` requests can be proxied correctly.

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
