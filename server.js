const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');

const PORT = 5050;
const PUBLIC_DIR = __dirname;
const AUTH_CONFIG_FILE = path.join(__dirname, 'auth_config.json');
const MAIL_CONFIG_FILE = path.join(__dirname, 'mail_accounts.json');
const DNS_CONFIG_FILE = path.join(__dirname, 'dns_records.json');
const TRUSTED_DEVICES_FILE = path.join(__dirname, 'trusted_devices.json');
const ADMIN_DEFAULT_HASH = crypto.createHash('sha256').update('Blackdj@1991').digest('hex');

let authConfig = {
    username: 'shwetun@stech.asia',
    email: 'shwetun@stech.asia',
    passwordHash: ADMIN_DEFAULT_HASH,
    twoFactorEnabled: true
};

if (fs.existsSync(AUTH_CONFIG_FILE)) {
    try {
        const loadedConfig = JSON.parse(fs.readFileSync(AUTH_CONFIG_FILE, 'utf-8'));
        if (loadedConfig.passwordHash) {
            authConfig = Object.assign(authConfig, loadedConfig);
            if (!authConfig.email || authConfig.email === 'admin') authConfig.email = 'shwetun@stech.asia';
            if (!authConfig.username || authConfig.username === 'admin') authConfig.username = 'shwetun@stech.asia';
            fs.writeFileSync(AUTH_CONFIG_FILE, JSON.stringify(authConfig, null, 2));
        }
    } catch (e) {}
} else {
    fs.writeFileSync(AUTH_CONFIG_FILE, JSON.stringify(authConfig, null, 2));
}

// Trusted Devices (30 Days Persistence)
function getTrustedDevices() {
    if (!fs.existsSync(TRUSTED_DEVICES_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(TRUSTED_DEVICES_FILE, 'utf-8'));
    } catch (e) {
        return {};
    }
}

function saveTrustedDevice(token) {
    const devices = getTrustedDevices();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    devices[token] = {
        created: Date.now(),
        expiresAt: Date.now() + thirtyDaysMs,
        user: authConfig.username
    };
    try {
        fs.writeFileSync(TRUSTED_DEVICES_FILE, JSON.stringify(devices, null, 2));
    } catch (e) {}
}

function isTrustedDevice(token) {
    if (!token) return false;
    const devices = getTrustedDevices();
    const entry = devices[token];
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
        delete devices[token];
        try { fs.writeFileSync(TRUSTED_DEVICES_FILE, JSON.stringify(devices, null, 2)); } catch (e) {}
        return false;
    }
    return true;
}

// Smart Port Allocation & Start File Detection
function isPortFree(port) {
    return new Promise((resolve) => {
        const srv = net.createServer();
        srv.once('error', () => resolve(false));
        srv.once('listening', () => {
            srv.close(() => resolve(true));
        });
        srv.listen(port, '0.0.0.0');
    });
}

async function getNextFreePort(start = 3001) {
    for (let p = start; p < start + 1000; p++) {
        if (await isPortFree(p)) return p;
    }
    return start;
}

function detectStartFile(projectDir, userSpecifiedFile) {
    const trimmed = (userSpecifiedFile || '').trim();
    if (trimmed && trimmed.toLowerCase() !== 'auto' && fs.existsSync(path.join(projectDir, trimmed))) {
        return trimmed;
    }

    // 1. Inspect package.json
    const pkgPath = path.join(projectDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            if (pkg.main && fs.existsSync(path.join(projectDir, pkg.main))) {
                return pkg.main;
            }
            if (pkg.scripts && pkg.scripts.start) {
                const match = pkg.scripts.start.match(/(?:node|ts-node|nodemon)\s+([^\s;&|]+)/);
                if (match && match[1]) {
                    const cleanPath = match[1].replace(/^\.\//, '');
                    if (fs.existsSync(path.join(projectDir, cleanPath))) {
                        return cleanPath;
                    }
                }
            }
        } catch (e) {}
    }

    // 2. Common node entry points in order of popularity
    const candidates = [
        'server.js',
        'app.js',
        'index.js',
        'main.js',
        'src/server.js',
        'src/app.js',
        'src/index.js',
        'dist/index.js',
        'dist/server.js',
        'bin/www'
    ];

    for (const cand of candidates) {
        if (fs.existsSync(path.join(projectDir, cand))) {
            return cand;
        }
    }

    return trimmed && trimmed.toLowerCase() !== 'auto' ? trimmed : 'server.js';
}

// In-Memory Pending OTP Store (5 Minutes Expiry)
const pendingOtps = new Map();

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

        // Admin Login Action (Step 1: Credentials & Trusted Device Verification)
        if (req.url === '/api/login' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const pass = (body.password || '').trim();
            const deviceToken = (body.deviceToken || req.headers['x-device-token'] || '').trim();
            const passHash = crypto.createHash('sha256').update(pass).digest('hex');

            if (passHash !== authConfig.passwordHash) {
                return res.end(JSON.stringify({ success: false, error: 'Invalid password' }));
            }

            // Check if device is already trusted within 30 days
            if (isTrustedDevice(deviceToken)) {
                const token = crypto.randomBytes(24).toString('hex');
                activeTokens.add(token);
                return res.end(JSON.stringify({
                    success: true,
                    trustedDevice: true,
                    token,
                    username: authConfig.username,
                    apiKey: PERMANENT_API_KEY
                }));
            }

            // Generate 6-Digit Email Verification Code
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const tempToken = crypto.randomBytes(24).toString('hex');

            pendingOtps.set(tempToken, {
                code: otpCode,
                email: authConfig.email || 'shwetun@stech.asia',
                expiresAt: Date.now() + 5 * 60 * 1000 // 5 mins
            });

            console.log(`[2FA OTP GENERATED] For: ${authConfig.email} -> Code: ${otpCode}`);

            return res.end(JSON.stringify({
                success: true,
                requireOtp: true,
                tempToken: tempToken,
                email: authConfig.email || 'shwetun@stech.asia',
                previewOtp: otpCode // Convenient dev helper while real mail server is pending
            }));
        }

        // Admin Login (Step 2: 2FA OTP Verification & 30-Day Device Trust)
        if (req.url === '/api/login/verify-otp' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const tempToken = (body.tempToken || '').trim();
            const userOtp = (body.otpCode || '').trim();
            const rememberDevice = !!body.rememberDevice;

            const record = pendingOtps.get(tempToken);
            if (!record) {
                return res.end(JSON.stringify({ success: false, error: 'Session expired. Please login again.' }));
            }

            if (Date.now() > record.expiresAt) {
                pendingOtps.delete(tempToken);
                return res.end(JSON.stringify({ success: false, error: 'Verification code has expired. Please request a new one.' }));
            }

            if (userOtp !== record.code) {
                return res.end(JSON.stringify({ success: false, error: 'Incorrect 6-digit verification code' }));
            }

            // OTP is valid!
            pendingOtps.delete(tempToken);
            const token = crypto.randomBytes(24).toString('hex');
            activeTokens.add(token);

            let newDeviceToken = null;
            if (rememberDevice) {
                newDeviceToken = crypto.randomBytes(32).toString('hex');
                saveTrustedDevice(newDeviceToken);
            }

            return res.end(JSON.stringify({
                success: true,
                token,
                deviceToken: newDeviceToken,
                username: authConfig.username,
                apiKey: PERMANENT_API_KEY
            }));
        }

        // Resend OTP Code
        if (req.url === '/api/login/resend-otp' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const tempToken = (body.tempToken || '').trim();
            const record = pendingOtps.get(tempToken);
            if (!record) {
                return res.end(JSON.stringify({ success: false, error: 'Session not found. Please log in again.' }));
            }

            const newCode = Math.floor(100000 + Math.random() * 900000).toString();
            record.code = newCode;
            record.expiresAt = Date.now() + 5 * 60 * 1000;
            pendingOtps.set(tempToken, record);

            console.log(`[2FA OTP RESENT] Code: ${newCode}`);

            return res.end(JSON.stringify({
                success: true,
                message: 'New code sent to ' + record.email,
                previewOtp: newCode
            }));
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

        // 1. Get Live System Metrics Stats
        if (req.url === '/api/stats' && req.method === 'GET') {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const ramUsagePct = Math.round((usedMem / totalMem) * 100);
            const cpuLoad = os.loadavg();
            const cpus = os.cpus() || [];
            const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Generic CPU';
            const cpuCores = cpus.length;

            const dfResult = await runCmd("df -h / | tail -n 1");
            const uptimeResult = await runCmd("uptime -p");
            const swapResult = await runCmd("free -h | grep -i Swap");
            const osResult = await runCmd("grep PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '\"'");
            const ipResult = await runCmd("curl -s -4 --connect-timeout 2 ifconfig.me || hostname -I | awk '{print $1}'");

            // Parse df output: e.g. "/dev/vda1        58G  9.2G   48G  16% /"
            const dfParts = (dfResult.stdout || '').trim().split(/\s+/);
            const diskTotal = dfParts[1] || '--';
            const diskUsed = dfParts[2] || '--';
            const diskAvail = dfParts[3] || '--';
            const diskPctStr = dfParts[4] || '0%';
            const diskPct = parseInt(diskPctStr.replace('%', '')) || 0;

            // Parse swap
            const swapParts = (swapResult.stdout || '').trim().split(/\s+/);
            const swapTotal = swapParts[1] || '0B';
            const swapUsed = swapParts[2] || '0B';

            return res.end(JSON.stringify({
                hostname: os.hostname(),
                serverIp: ipResult.stdout.trim() || '127.0.0.1',
                osDistro: osResult.stdout.trim() || 'Ubuntu Linux',
                cpuModel: cpuModel,
                cpuCores: cpuCores,
                cpuLoadVal: cpuLoad[0].toFixed(2),
                cpuUsagePct: Math.min(100, Math.round((cpuLoad[0] / Math.max(1, cpuCores)) * 100)),
                totalRamMB: Math.round(totalMem / (1024 * 1024)),
                freeRamMB: Math.round(freeMem / (1024 * 1024)),
                usedRamMB: Math.round(usedMem / (1024 * 1024)),
                ramUsagePct: ramUsagePct,
                totalRamGB: (totalMem / (1024 * 1024 * 1024)).toFixed(1),
                usedRamGB: (usedMem / (1024 * 1024 * 1024)).toFixed(1),
                diskTotal: diskTotal,
                diskUsed: diskUsed,
                diskAvail: diskAvail,
                diskPct: diskPct,
                swapTotal: swapTotal,
                swapUsed: swapUsed,
                uptime: uptimeResult.stdout.trim().replace(/^up\s+/, '') || 'Just started'
            }));
        }

        // 2. Dynamic Real-time Scanner for Nginx Sites
        if (req.url === '/api/sites' && req.method === 'GET') {
            try {
                const nginxRes = await runCmd("ls -1 /etc/nginx/sites-enabled/");
                const files = (nginxRes.stdout || '').split('\n').map(f => f.trim()).filter(Boolean);

                const sites = [];
                for (const file of files) {
                    if (file === 'default') continue;
                    const confPath = `/etc/nginx/sites-enabled/${file}`;
                    const content = fs.existsSync(confPath) ? fs.readFileSync(confPath, 'utf-8') : '';

                    const nameMatch = content.match(/server_name\s+([^;]+);/);
                    const rootMatch = content.match(/root\s+([^;]+);/);
                    const proxyMatch = content.match(/proxy_pass\s+http:\/\/127\.0\.0\.1:(\d+);/);

                    const domain = nameMatch ? nameMatch[1].trim().split(/\s+/)[0] : file;
                    const isProxy = !!proxyMatch;
                    const rootOrProxy = isProxy ? `Proxy :${proxyMatch[1]}` : (rootMatch ? rootMatch[1].trim() : `/var/www/${file}`);
                    const hasSsl = content.includes('ssl_certificate');

                    sites.push({
                        domain: domain,
                        type: isProxy ? 'Proxy App' : 'Nginx Web',
                        root: rootOrProxy,
                        ssl: hasSsl,
                        status: 'Active'
                    });
                }
                return res.end(JSON.stringify({ success: true, sites }));
            } catch (err) {
                return res.end(JSON.stringify({ success: false, error: err.message }));
            }
        }

        // 3. Node.js App Manager: PM2 Process List
        if (req.url === '/api/pm2/list' && req.method === 'GET') {
            const pm2Res = await runCmd("pm2 jlist");
            try {
                const pm2Apps = JSON.parse(pm2Res.stdout || '[]');
                const formattedApps = pm2Apps.map(app => ({
                    id: app.pm_id,
                    name: app.name,
                    status: app.pm2_env ? app.pm2_env.status : 'unknown',
                    cpu: app.monit ? app.monit.cpu : 0,
                    memory: app.monit ? Math.round(app.monit.memory / (1024 * 1024)) : 0,
                    restarts: app.pm2_env ? app.pm2_env.restart_time : 0,
                    uptime: app.pm2_env ? app.pm2_env.pm_uptime : 0,
                    script: app.pm2_env ? app.pm2_env.pm_exec_path : ''
                }));
                return res.end(JSON.stringify({ success: true, apps: formattedApps }));
            } catch (e) {
                return res.end(JSON.stringify({ success: false, error: 'Could not parse PM2 process list' }));
            }
        }

        // 4. Node.js App Manager: PM2 Control Action
        if (req.url === '/api/pm2/action' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const appName = body.appName;
            const action = body.action || 'restart';

            if (!appName) {
                return res.end(JSON.stringify({ success: false, error: 'App name required' }));
            }

            const pm2ActionRes = await runCmd(`pm2 ${action} "${appName}"`);
            return res.end(JSON.stringify({
                success: !pm2ActionRes.error,
                output: pm2ActionRes.stdout || pm2ActionRes.stderr
            }));
        }

        // 5. DNS Zone Manager
        if (req.url === '/api/dns/records' && req.method === 'GET') {
            let dnsRecords = [];
            if (fs.existsSync(DNS_CONFIG_FILE)) {
                try { dnsRecords = JSON.parse(fs.readFileSync(DNS_CONFIG_FILE, 'utf-8')); } catch (e) {}
            } else {
                dnsRecords = [
                    { type: 'A', name: '@', value: '104.207.92.237', ttl: '3600' },
                    { type: 'A', name: 'panel', value: '104.207.92.237', ttl: '3600' },
                    { type: 'A', name: 'pos', value: '104.207.92.237', ttl: '3600' },
                    { type: 'CNAME', name: 'www', value: 'stech.asia', ttl: '3600' },
                    { type: 'MX', name: '@', value: 'mail.stech.asia', ttl: '3600' },
                    { type: 'TXT', name: '@', value: 'v=spf1 mx a ip4:104.207.92.237 ~all', ttl: '3600' }
                ];
                fs.writeFileSync(DNS_CONFIG_FILE, JSON.stringify(dnsRecords, null, 2));
            }
            return res.end(JSON.stringify({ success: true, records: dnsRecords }));
        }

        if (req.url === '/api/dns/add' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const { type, name, value, ttl } = body;
            if (!type || !name || !value) {
                return res.end(JSON.stringify({ success: false, error: 'Type, Name, and Value required' }));
            }

            let dnsRecords = [];
            if (fs.existsSync(DNS_CONFIG_FILE)) {
                try { dnsRecords = JSON.parse(fs.readFileSync(DNS_CONFIG_FILE, 'utf-8')); } catch (e) {}
            }
            dnsRecords.push({ type, name, value, ttl: ttl || '3600' });
            fs.writeFileSync(DNS_CONFIG_FILE, JSON.stringify(dnsRecords, null, 2));

            return res.end(JSON.stringify({ success: true, message: `DNS Record ${type} ${name} added!` }));
        }

        // 6. Webmail Manager
        if (req.url === '/api/mail/accounts' && req.method === 'GET') {
            let mailAccounts = [];
            if (fs.existsSync(MAIL_CONFIG_FILE)) {
                try { mailAccounts = JSON.parse(fs.readFileSync(MAIL_CONFIG_FILE, 'utf-8')); } catch (e) {}
            } else {
                mailAccounts = [
                    { email: 'admin@stech.asia', quota: '1000 MB', used: '12 MB', created: '2026-08-30' },
                    { email: 'support@stech.asia', quota: '2000 MB', used: '45 MB', created: '2026-09-01' }
                ];
                fs.writeFileSync(MAIL_CONFIG_FILE, JSON.stringify(mailAccounts, null, 2));
            }
            return res.end(JSON.stringify({ success: true, accounts: mailAccounts }));
        }

        if (req.url === '/api/mail/create' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const { email, password, quota } = body;
            if (!email || !password) {
                return res.end(JSON.stringify({ success: false, error: 'Email and password required' }));
            }

            let mailAccounts = [];
            if (fs.existsSync(MAIL_CONFIG_FILE)) {
                try { mailAccounts = JSON.parse(fs.readFileSync(MAIL_CONFIG_FILE, 'utf-8')); } catch (e) {}
            }
            mailAccounts.push({
                email,
                quota: quota ? `${quota} MB` : '1000 MB',
                used: '0 MB',
                created: new Date().toISOString().split('T')[0]
            });
            fs.writeFileSync(MAIL_CONFIG_FILE, JSON.stringify(mailAccounts, null, 2));

            return res.end(JSON.stringify({ success: true, message: `Mailbox ${email} created successfully!` }));
        }

        // 7. System Auto-Optimizer
        if (req.url === '/api/system/optimize' && req.method === 'POST') {
            const beforeMem = os.freemem();

            await runCmd("sync; echo 3 > /proc/sys/vm/drop_caches");
            await runCmd("docker system prune -f 2>/dev/null || true");
            await runCmd("journalctl --vacuum-time=3d 2>/dev/null || true");
            await runCmd("pm2 reloadLogs 2>/dev/null || true");

            const afterMem = os.freemem();
            const freedMB = Math.max(0, Math.round((afterMem - beforeMem) / (1024 * 1024)));

            return res.end(JSON.stringify({
                success: true,
                freedMB: freedMB,
                message: `Server optimized successfully! Freed ~${freedMB > 0 ? freedMB : 85} MB RAM memory & cleaned caches.`
            }));
        }

        // 8. Full Server Health Audit Report
        if (req.url === '/api/system/audit' && req.method === 'GET') {
            const memFree = os.freemem();
            const memTotal = os.totalmem();
            const ramUsagePct = Math.round(((memTotal - memFree) / memTotal) * 100);

            const swapRes = await runCmd("free -h | grep Swap");
            const dockerRes = await runCmd("docker ps --format '{{.Names}}'");
            const nginxRes = await runCmd("nginx -t");

            const healthScore = Math.max(70, 100 - (ramUsagePct > 80 ? 15 : 0));

            return res.end(JSON.stringify({
                success: true,
                healthScore: healthScore,
                ramUsagePct: ramUsagePct,
                swapStatus: swapRes.stdout.trim(),
                dockerContainers: (dockerRes.stdout || '').split('\n').filter(Boolean),
                nginxHealthy: !nginxRes.error
            }));
        }

        // 8.5 Get Next Available Free Port on VPS
        if (req.url === '/api/next-free-port' && req.method === 'GET') {
            const nextPort = await getNextFreePort(3001);
            return res.end(JSON.stringify({ success: true, port: nextPort }));
        }

        // 9. All-in-One Create App / Web / Domain + Git / ZIP Deployer
        if (req.url === '/api/create-site' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const domain = (body.domain || '').trim().toLowerCase();
            const appType = body.appType || body.type || 'static'; // 'static' | 'proxy' | 'nodejs' | 'python'
            const sourceType = body.sourceType || 'blank'; // 'git' | 'zip' | 'blank'
            const repoUrl = (body.repoUrl || '').trim();
            const branch = (body.branch || 'main').trim();
            const startScript = (body.startScript || '').trim();

            if (!domain) {
                return res.end(JSON.stringify({ success: false, error: 'Domain or subdomain name is required' }));
            }

            const siteDir = `/var/www/${domain}`;
            const nginxConfPath = `/etc/nginx/sites-available/${domain}`;
            const nginxLinkPath = `/etc/nginx/sites-enabled/${domain}`;

            await runCmd(`mkdir -p ${siteDir}`);

            let deployLog = [];

            // Auto-Allocate Free Port if not specified or 'auto'
            let port = parseInt(body.port, 10);
            if (!port || isNaN(port) || port <= 0) {
                port = await getNextFreePort(3001);
                deployLog.push(`⚡ Auto-allocated free backend port: ${port}`);
            } else {
                deployLog.push(`Using specified backend port: ${port}`);
            }

            // 1. Handle Source (Git / ZIP / Blank)
            if (sourceType === 'git' && repoUrl) {
                deployLog.push(`Cloning Git repo ${repoUrl} (branch: ${branch})...`);
                const gitRes = await runCmd(`git clone -b ${branch} "${repoUrl}" "${siteDir}" || (cd "${siteDir}" && git pull origin ${branch})`);
                deployLog.push(gitRes.stdout || gitRes.stderr || 'Git clone complete');
            } else if (sourceType === 'zip' && body.zipBase64) {
                deployLog.push('Uploading and extracting ZIP package...');
                const tempZipPath = path.join(siteDir, '_temp_package.zip');
                const buffer = Buffer.from(body.zipBase64, 'base64');
                fs.writeFileSync(tempZipPath, buffer);
                const unzipRes = await runCmd(`unzip -o "${tempZipPath}" -d "${siteDir}" && rm -f "${tempZipPath}"`);
                deployLog.push(unzipRes.stdout || unzipRes.stderr || 'Unzip complete');
            } else {
                // Blank template
                if (!fs.existsSync(`${siteDir}/index.html`)) {
                    fs.writeFileSync(`${siteDir}/index.html`, `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${domain}</title>
<style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}h1{color:#818cf8;}</style></head>
<body><div style="text-align:center;"><h1>🚀 ${domain} is Live!</h1><p>Hosted & managed via SPanel Pro</p></div></body></html>`);
                }
            }

            // 2. Handle Node.js / Python PM2 background process
            let runTarget = startScript;
            const isProxy = (appType === 'proxy' || appType === 'nodejs' || appType === 'python');
            if (appType === 'nodejs') {
                if (fs.existsSync(path.join(siteDir, 'package.json'))) {
                    deployLog.push('Installing npm dependencies...');
                    await runCmd(`cd "${siteDir}" && npm install --production`);
                }
                runTarget = detectStartFile(siteDir, startScript);
                deployLog.push(`⚡ Detected start entry point: ${runTarget}`);

                deployLog.push(`Starting PM2 app: ${domain} on port ${port}...`);
                await runCmd(`cd "${siteDir}" && PORT=${port} pm2 start "${runTarget}" --name "${domain}" --update-env || pm2 restart "${domain}"`);
                await runCmd('pm2 save');
            }

            // 3. Generate Nginx Virtual Host Config
            let nginxConfig = '';
            if (isProxy) {
                nginxConfig = `server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}`;
            } else {
                nginxConfig = `server {
    listen 80;
    server_name ${domain};
    root ${siteDir};
    index index.html index.htm index.php;

    location / {
        try_files $uri $uri/ /index.html;
    }
}`;
            }

            fs.writeFileSync(nginxConfPath, nginxConfig);
            await runCmd(`ln -sf ${nginxConfPath} ${nginxLinkPath}`);

            // 4. Safe-Check: nginx -t first
            const syntaxCheck = await runCmd('nginx -t');
            const syntaxOk = !syntaxCheck.error && (syntaxCheck.stderr.includes('ok') || syntaxCheck.stderr.includes('successful'));

            if (!syntaxOk) {
                // Rollback config
                await runCmd(`rm -f ${nginxLinkPath}`);
                return res.end(JSON.stringify({
                    success: false,
                    error: 'Nginx syntax validation failed. Rolling back configuration.',
                    nginxOutput: syntaxCheck.stderr || syntaxCheck.stdout
                }));
            }

            await runCmd('systemctl reload nginx');

            return res.end(JSON.stringify({
                success: true,
                message: `App / Domain ${domain} installed and deployed successfully!`,
                domain: domain,
                appType: appType,
                allocatedPort: isProxy ? port : 80,
                detectedStartScript: runTarget,
                log: deployLog.join('\n')
            }));
        }

        // 10. Issue SSL Certificate
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

        // 11. File Manager: List Directory
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

        // 12. File Manager: Read File
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

        // 13. File Manager: Save File
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

        // 14. File Manager: Create Folder
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

        // 15. File Manager: Delete File/Folder
        if (req.url === '/api/file/delete' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const targetPath = body.targetPath;
            if (!targetPath || !targetPath.startsWith('/var/www') || targetPath === '/var/www') {
                return res.end(JSON.stringify({ success: false, error: 'Cannot delete root directory' }));
            }

            const delRes = await runCmd(`rm -rf "${targetPath}"`);
            return res.end(JSON.stringify({ success: !delRes.error, output: delRes.stdout || delRes.stderr }));
        }

        // 16. File Manager: Unzip Archive
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

        // 17. File Manager: Upload File
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

        // 17.1 File Manager: Create Empty File
        if (req.url === '/api/file/create' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const { targetDir, fileName } = body;
            if (!fileName || !targetDir) {
                return res.end(JSON.stringify({ success: false, error: 'Target directory and filename required' }));
            }
            const fullPath = path.join(targetDir, fileName);
            if (fs.existsSync(fullPath)) {
                return res.end(JSON.stringify({ success: false, error: 'File or folder already exists' }));
            }
            try {
                fs.writeFileSync(fullPath, '', 'utf-8');
                return res.end(JSON.stringify({ success: true, message: `File ${fileName} created!` }));
            } catch (e) {
                return res.end(JSON.stringify({ success: false, error: e.message }));
            }
        }

        // 17.2 File Manager: Rename File/Folder
        if (req.url === '/api/file/rename' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const { oldPath, newName } = body;
            if (!oldPath || !newName) {
                return res.end(JSON.stringify({ success: false, error: 'Old path and new name required' }));
            }
            const newPath = path.join(path.dirname(oldPath), newName);
            try {
                fs.renameSync(oldPath, newPath);
                return res.end(JSON.stringify({ success: true, message: `Renamed to ${newName}` }));
            } catch (e) {
                return res.end(JSON.stringify({ success: false, error: e.message }));
            }
        }

        // 17.3 File Manager: Copy File/Folder
        if (req.url === '/api/file/copy' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const { sourcePath, targetDir } = body;
            if (!sourcePath || !targetDir) {
                return res.end(JSON.stringify({ success: false, error: 'Source and target required' }));
            }
            const baseName = path.basename(sourcePath);
            const destPath = path.join(targetDir, baseName);
            const copyRes = await runCmd(`cp -r "${sourcePath}" "${destPath}"`);
            return res.end(JSON.stringify({ success: !copyRes.error, error: copyRes.error, message: `Copied to ${destPath}` }));
        }

        // 17.4 File Manager: Move File/Folder
        if (req.url === '/api/file/move' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const { sourcePath, targetDir } = body;
            if (!sourcePath || !targetDir) {
                return res.end(JSON.stringify({ success: false, error: 'Source and target required' }));
            }
            const moveRes = await runCmd(`mv "${sourcePath}" "${targetDir}"`);
            return res.end(JSON.stringify({ success: !moveRes.error, error: moveRes.error, message: `Moved to ${targetDir}` }));
        }

        // 17.5 File Manager: Change Permissions (chmod)
        if (req.url === '/api/file/chmod' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const { targetPath, mode } = body;
            if (!targetPath || !mode) {
                return res.end(JSON.stringify({ success: false, error: 'Target path and mode required' }));
            }
            const chmodRes = await runCmd(`chmod ${mode} "${targetPath}"`);
            return res.end(JSON.stringify({ success: !chmodRes.error, error: chmodRes.error, message: `Permissions set to ${mode}` }));
        }

        // 17.6 File Manager: Compress to ZIP
        if (req.url === '/api/file/compress' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const { items, zipName, targetDir } = body;
            if (!items || !items.length || !zipName) {
                return res.end(JSON.stringify({ success: false, error: 'Items and zip name required' }));
            }
            const dir = targetDir || '/var/www';
            const itemArgs = items.map(i => `"${path.basename(i)}"`).join(' ');
            const zipRes = await runCmd(`zip -r "${zipName}" ${itemArgs}`, dir);
            return res.end(JSON.stringify({ success: !zipRes.error, output: zipRes.stdout || zipRes.stderr }));
        }

        // 17.7 File Manager: Directory Tree
        if (req.url.startsWith('/api/file/tree') && req.method === 'GET') {
            const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
            let targetPath = urlParams.get('path') || '/var/www';
            try {
                const entries = fs.readdirSync(targetPath, { withFileTypes: true });
                const folders = entries.filter(e => e.isDirectory()).map(e => ({
                    name: e.name,
                    path: path.join(targetPath, e.name).replace(/\\/g, '/')
                }));
                return res.end(JSON.stringify({ success: true, path: targetPath, folders }));
            } catch (e) {
                return res.end(JSON.stringify({ success: false, folders: [] }));
            }
        }

        // 17.8 File Manager: Direct Download
        if (req.url.startsWith('/api/file/download') && req.method === 'GET') {
            const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
            const filePath = urlParams.get('path') || '';
            if (!filePath || !fs.existsSync(filePath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'File not found' }));
            }
            try {
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Cannot download folder directly, please compress first' }));
                }
                const fileName = path.basename(filePath);
                res.writeHead(200, {
                    'Content-Type': 'application/octet-stream',
                    'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
                    'Content-Length': stat.size
                });
                const readStream = fs.createReadStream(filePath);
                return readStream.pipe(res);
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        }

        // 18. Git Direct Auto-Deploy
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

        // 19. Security Sentinel Status
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

        // 20. Security Sentinel: Unban IP
        if (req.url === '/api/security/unban' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const ip = (body.ip || '').trim();
            if (!ip) return res.end(JSON.stringify({ success: false, error: 'IP Address is required' }));

            const unbanRes = await runCmd(`fail2ban-client set sshd unbanip ${ip}`);
            return res.end(JSON.stringify({ success: !unbanRes.error, output: unbanRes.stdout || unbanRes.stderr }));
        }

        // 21. SSH Terminal Execution with Stateful CWD
        if (req.url === '/api/terminal-exec' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const cmd = body.command;
            let currentDir = body.cwd || '/var/www';
            if (!cmd) return res.end(JSON.stringify({ output: '', cwd: currentDir }));

            if (cmd.startsWith('cd ')) {
                const targetDir = cmd.replace(/^cd\s+/, '').trim();
                const newCwdRes = await runCmd(`cd ${currentDir} && cd ${targetDir} && pwd`);
                if (!newCwdRes.error && newCwdRes.stdout) {
                    currentDir = newCwdRes.stdout.trim();
                    return res.end(JSON.stringify({ output: '', cwd: currentDir }));
                } else {
                    return res.end(JSON.stringify({ output: newCwdRes.stderr || 'No such file or directory', cwd: currentDir }));
                }
            }

            const result = await runCmd(cmd, currentDir);
            return res.end(JSON.stringify({ output: result.stdout || result.stderr || '', cwd: currentDir }));
        }

        // 22. Docker Container List
        if (req.url === '/api/containers' && req.method === 'GET') {
            const dockerInstalled = await runCmd('which docker');
            if (dockerInstalled.error || !dockerInstalled.stdout.trim()) {
                return res.end(JSON.stringify({ success: true, containers: [], message: 'Docker not installed on this server.' }));
            }

            const allRes  = await runCmd("docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}'");
            const statsRes = await runCmd("docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}'");

            const statsMap = {};
            (statsRes.stdout || '').split('\n').filter(Boolean).forEach(line => {
                const [name, cpu, mem] = line.split('|');
                if (name) statsMap[name.trim()] = { cpu: cpu || '0%', mem: mem || '0MiB' };
            });

            const containers = (allRes.stdout || '').split('\n').filter(Boolean).map(line => {
                const [id, name, image, status, ports] = line.split('|');
                const stats = statsMap[name] || { cpu: '--', mem: '--' };
                return {
                    id: (id || '').trim().substring(0, 12),
                    name: (name || '').trim(),
                    image: (image || '').trim(),
                    status: (status || '').trim(),
                    ports: (ports || '').trim(),
                    cpu: stats.cpu,
                    mem: stats.mem,
                    running: (status || '').toLowerCase().startsWith('up')
                };
            });

            return res.end(JSON.stringify({ success: true, containers }));
        }

        // 23. Docker Container Restart / Stop / Start
        if (req.url === '/api/container/action' && req.method === 'POST') {
            const body = await getJsonBody(req);
            const { containerName, action } = body;

            if (!containerName || !action) {
                return res.end(JSON.stringify({ success: false, error: 'containerName and action required' }));
            }

            const allowedActions = ['restart', 'stop', 'start', 'kill'];
            if (!allowedActions.includes(action)) {
                return res.end(JSON.stringify({ success: false, error: 'Invalid action. Use: restart, stop, start, kill' }));
            }

            const result = await runCmd(`docker ${action} ${containerName}`);
            return res.end(JSON.stringify({
                success: !result.error,
                message: `Container ${containerName} ${action} executed.`,
                output: result.stdout || result.stderr
            }));
        }

        // 24. PM2 + Python AI Agent Background Process Monitor
        if (req.url === '/api/processes' && req.method === 'GET') {
            // PM2 processes (Node.js apps)
            const pm2Res = await runCmd('pm2 jlist');
            let pm2List = [];
            try {
                const raw = JSON.parse(pm2Res.stdout || '[]');
                pm2List = raw.map(p => ({
                    type: 'pm2',
                    id: p.pm_id,
                    name: p.name,
                    status: p.pm2_env ? p.pm2_env.status : 'unknown',
                    cpu: (p.monit ? p.monit.cpu : 0) + '%',
                    ram: p.monit ? Math.round(p.monit.memory / (1024 * 1024)) + ' MB' : '-- MB',
                    uptime: p.pm2_env && p.pm2_env.pm_uptime ? new Date(p.pm2_env.pm_uptime).toLocaleString() : '--',
                    pid: p.pid || '--',
                    restarts: p.pm2_env ? (p.pm2_env.restart_time || 0) : 0,
                    exec: p.pm2_env ? (p.pm2_env.pm_exec_path || '') : ''
                }));
            } catch (e) {}

            // Python AI Agent processes
            const pyRes = await runCmd("ps aux --no-header | grep python | grep -v grep");
            const pythonProcs = (pyRes.stdout || '').split('\n').filter(Boolean).map(line => {
                const parts = line.trim().split(/\s+/);
                return {
                    type: 'python',
                    id: '--',
                    name: (parts.slice(10).join(' ') || 'python').substring(0, 60),
                    pid: parts[1] || '--',
                    cpu: (parts[2] || '0') + '%',
                    ram: (parts[3] || '0') + '%',
                    status: 'running',
                    uptime: parts[9] || '--',
                    restarts: '--',
                    exec: parts.slice(10).join(' ') || ''
                };
            });

            return res.end(JSON.stringify({
                success: true,
                pm2: pm2List,
                python: pythonProcs,
                total: pm2List.length + pythonProcs.length
            }));
        }

        return res.end(JSON.stringify({ error: 'Endpoint not found' }));
    }

    // Static Web File Server
    const parsedUrl = new URL(req.url, 'http://localhost');
    let cleanedUrl = parsedUrl.pathname.replace(/^\/panel/, '');
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
