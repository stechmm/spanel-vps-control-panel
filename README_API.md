# SPanel Pro - Master API Documentation & Integration Credentials

## 🔑 Authentication Credentials

- **Control Panel Dashboard:** `https://panel.stech.asia`
- **Human Admin Password:** `admin123`
- **Permanent AI Agent API Key:** `spanel_sk_live_998877665544332211`
- **Target VPS IP:** `167.172.79.75`

---

## 🚀 REST API Endpoints for AI Agents & Automation

All API endpoints accept requests with the following HTTP Header:
`X-API-Key: spanel_sk_live_998877665544332211`

### 1. Create Website / Subdomain / App Proxy
- **Endpoint:** `POST https://panel.stech.asia/api/create-site`
- **Headers:**
  - `Content-Type: application/json`
  - `X-API-Key: spanel_sk_live_998877665544332211`
- **Body (Static HTML Web Site):**
  ```json
  {
    "domain": "shop.stech.asia",
    "type": "static"
  }
  ```
- **Body (Node.js / Python Reverse Proxy App):**
  ```json
  {
    "domain": "api.stech.asia",
    "type": "proxy",
    "port": 3000
  }
  ```

---

### 2. Issue Let's Encrypt SSL Certificate
- **Endpoint:** `POST https://panel.stech.asia/api/issue-ssl`
- **Headers:** `X-API-Key: spanel_sk_live_998877665544332211`
- **Body:**
  ```json
  {
    "domain": "shop.stech.asia"
  }
  ```

---

### 3. File Manager: List Directory
- **Endpoint:** `GET https://panel.stech.asia/api/files?path=/var/www`
- **Headers:** `X-API-Key: spanel_sk_live_998877665544332211`

---

### 4. File Manager: Read File Content
- **Endpoint:** `POST https://panel.stech.asia/api/file/read`
- **Headers:** `X-API-Key: spanel_sk_live_998877665544332211`
- **Body:**
  ```json
  {
    "filePath": "/var/www/stech.asia/index.html"
  }
  ```

---

### 5. File Manager: Save / Write File Content
- **Endpoint:** `POST https://panel.stech.asia/api/file/save`
- **Headers:** `X-API-Key: spanel_sk_live_998877665544332211`
- **Body:**
  ```json
  {
    "filePath": "/var/www/stech.asia/index.html",
    "content": "<h1>Hello World from AI Agent</h1>"
  }
  ```

---

### 6. Execute Shell Terminal Command
- **Endpoint:** `POST https://panel.stech.asia/api/terminal-exec`
- **Headers:** `X-API-Key: spanel_sk_live_998877665544332211`
- **Body:**
  ```json
  {
    "command": "pm2 list"
  }
  ```

---

### 7. Get Real-time System Metrics
- **Endpoint:** `GET https://panel.stech.asia/api/stats`
- **Headers:** `X-API-Key: spanel_sk_live_998877665544332211`
