const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORT = 5050;
const PUBLIC_DIR = __dirname;

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

// Utility: parse JSON request body
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

// Utility: execute shell command promise
function runCmd(cmd) {
    return new Promise((resolve) => {
        exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
            resolve({ error: error ? error.message : null, stdout: stdout || '', stderr: stderr || '' });
        });
    });
}

const server = http.createServer(async (req, res) => {
    // API Endpoints
    if (req.url.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');

        // 1. Get Live System Metrics Stats
        if (req.url === '/api/stats' && req.method === 'GET') {
            const memoryUsage = process.memoryUsage();
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

            // Create directory & sample index.html
            await runCmd(`mkdir -p ${siteDir}`);
            if (!fs.existsSync(`${siteDir}/index.html`)) {
                fs.writeFileSync(`${siteDir}/index.html`, `<h1>Welcome to ${domain}</h1><p>Hosted via NovaPanel</p>`);
            }

            // Write Nginx config & reload
            fs.writeFileSync(nginxConfPath, nginxConfig);
            await runCmd(`ln -sf ${nginxConfPath} ${nginxLinkPath}`);
            const testResult = await runCmd("nginx -t && systemctl reload nginx");

            return res.end(JSON.stringify({
                success: true,
                message: `Website ${domain} created successfully!`,
                nginxOutput: testResult.stdout || testResult.stderr
            }));
        }

        // 3. Issue SSL Certificate (Certbot Let's Encrypt)
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

        // 5. File Manager: Read File Content
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

        // 6. File Manager: Save File Content
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

        // 7. SSH Terminal CLI Executor
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
    console.log(`NovaPanel Control Panel Server running at http://0.0.0.0:${PORT}/`);
});
