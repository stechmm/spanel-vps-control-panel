const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');

const PORT = 5050;
const PUBLIC_DIR = __dirname;
const AUTH_CONFIG_FILE = path.join(__dirname, 'auth_config.json');

// Default initial password: Blackdj@1991
let authConfig = {
    username: 'admin',
    passwordHash: crypto.createHash('sha256').update('Blackdj@1991').digest('hex')
};

// Load persistent auth config if exists
if (fs.existsSync(AUTH_CONFIG_FILE)) {
    try {
        const loadedConfig = JSON.parse(fs.readFileSync(AUTH_CONFIG_FILE, 'utf-8'));
        if (loadedConfig.passwordHash) {
            authConfig = loadedConfig;
        }
    } catch (e) {}
} else {
    fs.writeFileSync(AUTH_CONFIG_FILE, JSON.stringify(authConfig, null, 2));
}

const PERMANENT_API_KEY = process.env.SPANEL_API_KEY || 'spanel_sk_live_998877665544332211';
const activeTokens = new Set();

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

function getJsonBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                resolve({});
            }
        });
    });
}

function runCmd(cmd, cwd = '/var/www') {
    return new Promise((resolve) => {
        exec(cmd, { cwd, timeout: 60000 }, (error, stdout, stderr) => {
            resolve({ error: error ? error.message : null, stdout: stdout || '', stderr: stderr || '' });
        });
    });
}

function isAuthorized(req) {
    const apiKey = req.headers['x-api-key'] || '';
    if (apiKey === PERMANENT_API_KEY) return true;

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '').trim();
    return activeTokens.has(token);
}

const server = http.createServer(async (req, res) => {
    // API Endpoints
    if (req.url.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');

        // Admin Login Action
        if (req.url === '/api/login' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const passHash = crypto.createHash('sha256').update(body.password || '').digest('hex');
            const reqUsername = body.username || 'admin';

            if (passHash === authConfig.passwordHash) {
                const token = crypto.randomBytes(24).toString('hex');
                activeTokens.add(token);
                return res.end(JSON.stringify({
                    success: true,
                    token,
                    username: authConfig.username,
                    apiKey: PERMANENT_API_KEY
                }));
            } else {
                return res.end(JSON.stringify({ success: false, error: 'Invalid password' }));
            }
        }

        // Verify Authentication Status
        if (req.url === '/api/auth-check' && req.method === 'GET') {
            return res.end(JSON.stringify({ authenticated: isAuthorized(req), username: authConfig.username }));
        }

        // Protect all sensitive API endpoints
        if (!isAuthorized(req)) {
            res.statusCode = 401;
            return res.end(JSON.stringify({ error: 'Unauthorized. Valid Admin Password or X-API-Key header required.' }));
        }

        // Change Admin Credentials (Username & Password)
        if (req.url === '/api/security/change-credentials' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const currentPass = body.currentPassword || '';
            const newUsername = (body.newUsername || '').trim() || authConfig.username;
            const newPassword = body.newPassword || '';

            const currentHash = crypto.createHash('sha256').update(currentPass).digest('hex');

            if (currentHash !== authConfig.passwordHash) {
                return res.end(JSON.stringify({ success: false, error: 'Current password is incorrect' }));
            }

            if (newPassword.length < 6) {
                return res.end(JSON.stringify({ success: false, error: 'New password must be at least 6 characters' }));
            }

            const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');
            authConfig.username = newUsername;
            authConfig.passwordHash = newHash;

            // Save persistently to JSON file
            fs.writeFileSync(AUTH_CONFIG_FILE, JSON.stringify(authConfig, null, 2));

            return res.end(JSON.stringify({
                success: true,
                message: 'Admin Username & Password updated successfully!'
            }));
        }

        // 1. Get Live System Metrics Stats
        if (req.url === '/api/stats' && req.method === 'GET') {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const cpuLoad = os.loadavg();

            const dfResult = await runCmd("df -h / | tail -n 1");
            const uptimeResult = await runCmd("uptime -p");

            return res.end(JSON.stringify({
                cpuLoad: cpuLoad[0].toFixed(2),
                totalRamMB: Math.round(totalMem / (1024 * 1024)),
                freeRamMB: Math.round(freeMem / (1024 * 1024)),
                usedRamMB: Math.round((totalMem - freeMem) / (1024 * 1024)),
                diskInfo: dfResult.stdout.trim(),
                uptime: uptimeResult.stdout.trim().replace('up ', '')
            }));
        }

        // 2. Create Domain / Website + Nginx Config
        if (req.url === '/api/create-site' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const domain = (body.domain || '').trim().toLowerCase();
            const type = body.type || 'static';

            if (!domain) {
                return res.end(JSON.stringify({ success: false, error: 'Domain name is required' }));
            }

            const siteDir = `/var/www/${domain}`;
            const nginxConfPath = `/etc/nginx/sites-available/${domain}`;
            const nginxLinkPath = `/etc/nginx/sites-enabled/${domain}`;

            let nginxConfig = '';
            if (type === 'proxy') {
                const port = body.port || 3000;
                nginxConfig = `server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}`;
            } else {
                nginxConfig = `server {
    listen 80;
    server_name ${domain};
    root ${siteDir};
    index index.html index.php;

    location / {
        try_files $uri $uri/ /index.html;
    }
}`;
            }

            await runCmd(`mkdir -p ${siteDir}`);
            if (!fs.existsSync(`${siteDir}/index.html`)) {
                fs.writeFileSync(`${siteDir}/index.html`, `<h1>Welcome to ${domain}</h1><p>Hosted via SPanel Pro</p>`);
            }

            fs.writeFileSync(nginxConfPath, nginxConfig);
            await runCmd(`ln -sf ${nginxConfPath} ${nginxLinkPath}`);
            const testResult = await runCmd("nginx -t && systemctl reload nginx");

            return res.end(JSON.stringify({
                success: true,
                message: `Website ${domain} created successfully!`,
                nginxOutput: testResult.stdout || testResult.stderr
            }));
        }

        // 3. Issue SSL Certificate
        if (req.url === '/api/issue-ssl' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const domain = (body.domain || '').trim();

            if (!domain) {
                return res.end(JSON.stringify({ success: false, error: 'Domain name is required' }));
            }

            const certbotCmd = `certbot --nginx -d ${domain} --non-interactive --agree-tos --register-unsafely-without-email`;
            const certResult = await runCmd(certbotCmd);

            return res.end(JSON.stringify({
                success: certResult.error === null,
                output: certResult.stdout || certResult.stderr,
                error: certResult.error
            }));
        }

        // 4. File Manager: List Directory
        if (req.url.startsWith('/api/files') && req.method === 'GET') {
            const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
            let targetPath = urlParams.get('path') || '/var/www';
            if (!targetPath.startsWith('/var/www')) targetPath = '/var/www';

            try {
                const files = fs.readdirSync(targetPath);
                const fileList = files.map(file => {
                    const fullPath = path.join(targetPath, file);
                    try {
                        const stats = fs.statSync(fullPath);
                        return {
                            name: file,
                            path: fullPath,
                            isDir: stats.isDirectory(),
                            size: stats.isDirectory() ? '--' : (stats.size / 1024).toFixed(1) + ' KB',
                            perm: (stats.mode & 0o777).toString(8),
                            mtime: stats.mtime.toLocaleString()
                        };
                    } catch (e) {
                        return null;
                    }
                }).filter(Boolean);

                return res.end(JSON.stringify({ success: true, currentPath: targetPath, files: fileList }));
            } catch (err) {
                return res.end(JSON.stringify({ success: false, error: err.message }));
            }
        }

        // 5. File Manager: Read File
        if (req.url === '/api/file/read' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const filePath = body.filePath;
            if (!filePath || !fs.existsSync(filePath)) {
                return res.end(JSON.stringify({ success: false, error: 'File not found' }));
            }

            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                return res.end(JSON.stringify({ success: true, content }));
            } catch (e) {
                return res.end(JSON.stringify({ success: false, error: e.message }));
            }
        }

        // 6. File Manager: Save File
        if (req.url === '/api/file/save' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const filePath = body.filePath;
            const content = body.content || '';

            try {
                fs.writeFileSync(filePath, content, 'utf-8');
                return res.end(JSON.stringify({ success: true, message: 'File saved successfully!' }));
            } catch (e) {
                return res.end(JSON.stringify({ success: false, error: e.message }));
            }
        }

        // 7. File Manager: Create Folder
        if (req.url === '/api/file/mkdir' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const folderPath = body.folderPath;
            if (!folderPath || !folderPath.startsWith('/var/www')) {
                return res.end(JSON.stringify({ success: false, error: 'Invalid folder path' }));
            }

            try {
                fs.mkdirSync(folderPath, { recursive: true });
                return res.end(JSON.stringify({ success: true, message: 'Folder created!' }));
            } catch (e) {
                return res.end(JSON.stringify({ success: false, error: e.message }));
            }
        }

        // 8. File Manager: Delete File/Folder
        if (req.url === '/api/file/delete' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const targetPath = body.targetPath;
            if (!targetPath || !targetPath.startsWith('/var/www') || targetPath === '/var/www') {
                return res.end(JSON.stringify({ success: false, error: 'Cannot delete root directory' }));
            }

            const delRes = await runCmd(`rm -rf "${targetPath}"`);
            return res.end(JSON.stringify({ success: !delRes.error, output: delRes.stdout || delRes.stderr }));
        }

        // 9. File Manager: Unzip Archive
        if (req.url === '/api/file/unzip' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const zipPath = body.zipPath;
            const destDir = body.destDir || path.dirname(zipPath);

            if (!zipPath || !fs.existsSync(zipPath)) {
                return res.end(JSON.stringify({ success: false, error: 'ZIP file not found' }));
            }

            const unzipRes = await runCmd(`unzip -o "${zipPath}" -d "${destDir}"`);
            return res.end(JSON.stringify({ success: !unzipRes.error, output: unzipRes.stdout || unzipRes.stderr }));
        }

        // 10. File Manager: Upload File
        if (req.url === '/api/file/upload' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const targetDir = body.targetDir || '/var/www';
            const fileName = body.fileName;
            const base64Data = body.base64Data;

            if (!fileName || !base64Data) {
                return res.end(JSON.stringify({ success: false, error: 'Missing file data' }));
            }

            const destPath = path.join(targetDir, fileName);
            try {
                const buffer = Buffer.from(base64Data, 'base64');
                fs.writeFileSync(destPath, buffer);
                return res.end(JSON.stringify({ success: true, message: `File ${fileName} uploaded!` }));
            } catch (e) {
                return res.end(JSON.stringify({ success: false, error: e.message }));
            }
        }

        // 11. Git Direct Auto-Deploy
        if (req.url === '/api/git/deploy' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const repoUrl = (body.repoUrl || '').trim();
            const branch = body.branch || 'main';
            const targetDomain = body.domain;

            if (!repoUrl || !targetDomain) {
                return res.end(JSON.stringify({ success: false, error: 'Git Repo URL and target Domain required' }));
            }

            const deployDir = `/var/www/${targetDomain}`;
            await runCmd(`mkdir -p ${deployDir}`);

            let gitCmd = '';
            if (fs.existsSync(`${deployDir}/.git`)) {
                gitCmd = `git fetch origin && git checkout ${branch} && git pull origin ${branch}`;
            } else {
                gitCmd = `rm -rf ${deployDir}/* && git clone -b ${branch} ${repoUrl} ${deployDir}`;
            }

            const deployRes = await runCmd(gitCmd, deployDir);

            if (fs.existsSync(`${deployDir}/package.json`)) {
                await runCmd(`npm install`, deployDir);
            }

            await runCmd(`systemctl reload nginx`);

            return res.end(JSON.stringify({
                success: !deployRes.error,
                message: `Git Repository deployed to ${targetDomain}!`,
                output: deployRes.stdout || deployRes.stderr
            }));
        }

        // 12. Security Sentinel Status
        if (req.url === '/api/security/status' && req.method === 'GET') {
            const fail2banRes = await runCmd("fail2ban-client status sshd");
            const ufwRes = await runCmd("ufw status numbered");
            const failedLoginsRes = await runCmd("grep 'Failed password' /var/log/auth.log 2>/dev/null | wc -l || echo 0");

            const bannedIpsMatch = (fail2banRes.stdout || '').match(/Banned IP list:\s*(.*)/);
            const bannedIps = bannedIpsMatch && bannedIpsMatch[1] ? bannedIpsMatch[1].trim().split(/\s+/).filter(Boolean) : [];

            return res.end(JSON.stringify({
                success: true,
                fail2banActive: !fail2banRes.error,
                bannedIps: bannedIps,
                bannedCount: bannedIps.length,
                failedSshCount: parseInt((failedLoginsRes.stdout || '0').trim(), 10) || 0,
                ufwStatus: ufwRes.stdout || ufwRes.stderr
            }));
        }

        // 13. Security Sentinel: Unban IP
        if (req.url === '/api/security/unban' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const ip = (body.ip || '').trim();
            if (!ip) return res.end(JSON.stringify({ success: false, error: 'IP Address is required' }));

            const unbanRes = await runCmd(`fail2ban-client set sshd unbanip ${ip}`);
            return res.end(JSON.stringify({ success: !unbanRes.error, output: unbanRes.stdout || unbanRes.stderr }));
        }

        // 14. SSH Terminal Execution
        if (req.url === '/api/terminal-exec' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const cmd = body.command;
            if (!cmd) return res.end(JSON.stringify({ output: '' }));

            const result = await runCmd(cmd);
            return res.end(JSON.stringify({ output: result.stdout || result.stderr || result.error }));
        }

        return res.end(JSON.stringify({ error: 'Endpoint not found' }));
    }

    // Static Web File Server
    let cleanedUrl = req.url.replace(/^\/panel/, '');
    if (cleanedUrl === '' || cleanedUrl === '/') {
        cleanedUrl = '/index.html';
    }

    let filePath = path.join(PUBLIC_DIR, cleanedUrl);
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'text/plain';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexContent) => {
                    if (err2) {
                        res.writeHead(404, { 'Content-Type': 'text/html' });
                        res.end('<h1>404 Not Found</h1>', 'utf-8');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(indexContent, 'utf-8');
                    }
                });
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`SPanel Production Server running at http://0.0.0.0:${PORT}/`);
});
