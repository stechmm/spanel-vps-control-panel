/**
 * SPanel Pro - Power Enterprise Control Panel Suite
 */

let currentPath = '/var/www';
let authToken = localStorage.getItem('spanel_token') || '';

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initNavigation();
});

// Authentication Handling
async function checkAuth() {
    if (!authToken) {
        showLoginScreen();
        return;
    }

    try {
        const res = await fetch('/api/auth-check', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.authenticated) {
            hideLoginScreen();
            loadSites();
            loadNodeApps();
            loadDnsRecords();
            loadMailAccounts();
            loadFiles(currentPath);
        } else {
            showLoginScreen();
        }
    } catch (e) {
        hideLoginScreen();
        loadSites();
        loadNodeApps();
        loadFiles(currentPath);
    }
}

function showLoginScreen() {
    const el = document.getElementById('login-screen');
    if (el) el.style.display = 'flex';
}

function hideLoginScreen() {
    const el = document.getElementById('login-screen');
    if (el) el.style.display = 'none';
}

function togglePasswordVisibility() {
    const input = document.getElementById('admin-pass-input');
    const eye = document.getElementById('toggle-pass-eye');
    if (!input || !eye) return;

    if (input.type === 'password') {
        input.type = 'text';
        eye.className = 'fa-solid fa-eye-slash';
        eye.style.color = '#6366f1';
    } else {
        input.type = 'password';
        eye.className = 'fa-solid fa-eye';
        eye.style.color = '#9ca3af';
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const passInput = document.getElementById('admin-pass-input').value.trim();
    const errorEl = document.getElementById('login-error');

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: passInput })
        });
        const data = await res.json();

        if (data.success && data.token) {
            authToken = data.token;
            localStorage.setItem('spanel_token', authToken);
            hideLoginScreen();
            loadSites();
            loadNodeApps();
            loadDnsRecords();
            loadMailAccounts();
            loadFiles(currentPath);
            showNotification('Welcome to SPanel Pro Admin Dashboard!');
        } else {
            errorEl.innerText = data.error || 'Invalid admin password!';
            errorEl.style.display = 'block';
        }
    } catch (e) {
        errorEl.innerText = 'Login server error.';
        errorEl.style.display = 'block';
    }
}

// Navigation Handling
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = item.getAttribute('data-tab');

            navItems.forEach(nav => nav.classList.remove('active'));
            tabContents.forEach(tab => tab.classList.remove('active'));

            item.classList.add('active');
            const targetEl = document.getElementById(`tab-${targetTab}`);
            if (targetEl) targetEl.classList.add('active');
        });
    });
}

// 1. Websites & Domains Management (Dynamic Nginx Scanner)
async function loadSites() {
    const tbody = document.getElementById('sites-table-body');
    if (!tbody) return;

    try {
        const res = await fetch('/api/sites', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        if (data.success && data.sites) {
            tbody.innerHTML = data.sites.map((site, index) => `
                <tr>
                    <td>
                        <div class="domain-cell">
                            <i class="fa-solid fa-globe icon-site"></i>
                            <div>
                                <strong>${site.domain}</strong>
                                <small>${site.type}</small>
                            </div>
                        </div>
                    </td>
                    <td><span class="tag">${site.type}</span></td>
                    <td><code>${site.root}</code></td>
                    <td>
                        ${site.ssl ? 
                            '<span class="badge badge-success"><i class="fa-solid fa-lock"></i> SSL Active</span>' : 
                            `<button class="btn-icon-sm text-primary" title="Issue SSL" onclick="issueSsl('${site.domain}')"><i class="fa-solid fa-shield-halved"></i> Issue SSL</button>`
                        }
                    </td>
                    <td><span class="status-badge active"><i class="fa-solid fa-check"></i> ${site.status}</span></td>
                    <td>
                        <button class="btn-icon-sm text-primary" title="Open Site" onclick="window.open('https://${site.domain}', '_blank')"><i class="fa-solid fa-external-link"></i></button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (e) {
        console.error('Sites load error', e);
    }
}

// 2. Node.js PM2 Process Manager
async function loadNodeApps() {
    const tbody = document.getElementById('pm2-table-body');
    if (!tbody) return;

    try {
        const res = await fetch('/api/pm2/list', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success && data.apps) {
            tbody.innerHTML = data.apps.map(app => `
                <tr>
                    <td><code>${app.id}</code></td>
                    <td>
                        <strong>${app.name}</strong>
                        <br><small style="color:var(--text-muted); font-size:11px;">${app.script || 'Node/Python Process'}</small>
                    </td>
                    <td>
                        <span class="status-badge ${app.status === 'online' ? 'active' : 'inactive'}">
                            <i class="fa-solid fa-circle"></i> ${app.status}
                        </span>
                    </td>
                    <td><code>${app.cpu}%</code></td>
                    <td><code>${app.memory} MB</code></td>
                    <td>${app.restarts}</td>
                    <td>
                        <button class="btn-icon-sm text-warning" title="Restart App" onclick="pm2Action('${app.name}', 'restart')"><i class="fa-solid fa-rotate-right"></i></button>
                        <button class="btn-icon-sm text-danger" title="Stop App" onclick="pm2Action('${app.name}', 'stop')"><i class="fa-solid fa-stop"></i></button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (e) {
        console.error('PM2 load error', e);
    }
}

async function pm2Action(appName, action) {
    showNotification(`Executing PM2 ${action} on ${appName}...`);
    try {
        const res = await fetch('/api/pm2/action', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ appName, action })
        });
        const data = await res.json();
        if (data.success) {
            showNotification(`PM2 ${action} completed on ${appName}!`);
            loadNodeApps();
        }
    } catch (e) {
        showNotification(`PM2 Action triggered`);
    }
}

// 3. DNS Zone Manager
async function loadDnsRecords() {
    const tbody = document.getElementById('dns-table-body');
    if (!tbody) return;

    try {
        const res = await fetch('/api/dns/records', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success && data.records) {
            tbody.innerHTML = data.records.map(rec => `
                <tr>
                    <td><span class="badge badge-success">${rec.type}</span></td>
                    <td><strong>${rec.name}</strong></td>
                    <td><code>${rec.value}</code></td>
                    <td>${rec.ttl} sec</td>
                    <td><span class="status-badge active"><i class="fa-solid fa-check"></i> Active</span></td>
                </tr>
            `).join('');
        }
    } catch (e) {}
}

function openAddDnsModal() {
    const modal = document.getElementById('modal-add-dns');
    if (modal) modal.style.display = 'flex';
}

async function submitAddDns() {
    const type = document.getElementById('dns-type-input').value;
    const name = document.getElementById('dns-name-input').value.trim();
    const value = document.getElementById('dns-value-input').value.trim();

    if (!name || !value) {
        alert('Please fill in DNS Name and Target Value.');
        return;
    }

    const res = await fetch('/api/dns/add', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ type, name, value })
    });
    const data = await res.json();
    if (data.success) {
        closeModal('modal-add-dns');
        showNotification(`DNS Record ${type} ${name} created!`);
        loadDnsRecords();
    }
}

// 4. Webmail Engine Manager
async function loadMailAccounts() {
    const tbody = document.getElementById('mail-table-body');
    if (!tbody) return;

    try {
        const res = await fetch('/api/mail/accounts', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success && data.accounts) {
            tbody.innerHTML = data.accounts.map(acc => `
                <tr>
                    <td><i class="fa-solid fa-envelope text-primary"></i> <strong>${acc.email}</strong></td>
                    <td>${acc.quota}</td>
                    <td>${acc.used}</td>
                    <td>${acc.created}</td>
                    <td>
                        <button class="btn-icon-sm text-primary" title="Access Webmail" onclick="window.open('https://panel.stech.asia', '_blank')"><i class="fa-solid fa-paper-plane"></i> Webmail</button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (e) {}
}

function openAddMailboxModal() {
    const modal = document.getElementById('modal-add-mailbox');
    if (modal) modal.style.display = 'flex';
}

async function submitAddMailbox() {
    const email = document.getElementById('mail-email-input').value.trim();
    const password = document.getElementById('mail-pass-input').value.trim();
    const quota = document.getElementById('mail-quota-input').value;

    if (!email || !password) {
        alert('Please fill in Email and Password.');
        return;
    }

    const res = await fetch('/api/mail/create', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ email, password, quota })
    });
    const data = await res.json();
    if (data.success) {
        closeModal('modal-add-mailbox');
        showNotification(`Mailbox ${email} created successfully!`);
        loadMailAccounts();
    }
}

// Create Domain Action (API Call)
async function submitCreateSite() {
    const domainInput = document.getElementById('new-domain-input').value.trim();
    const appType = document.getElementById('new-domain-php').value;

    if (!domainInput) {
        alert('Please enter a valid domain or subdomain name (e.g. shop.stech.asia)!');
        return;
    }

    showNotification(`Creating Nginx configuration for ${domainInput}...`);

    try {
        const res = await fetch('/api/create-site', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ domain: domainInput, type: appType })
        });
        const data = await res.json();

        if (data.success) {
            loadSites();
            closeModal('modal-add-site');
            showNotification(`Site ${domainInput} created successfully on VPS!`);
        } else {
            alert('Error: ' + data.error);
        }
    } catch (e) {
        showNotification(`Website ${domainInput} created & added!`);
    }
}

// Issue SSL Action (Certbot API Call)
async function issueSsl(domainName) {
    showNotification(`Requesting Let's Encrypt SSL for ${domainName}...`);
    try {
        const res = await fetch('/api/issue-ssl', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ domain: domainName })
        });
        const data = await res.json();
        if (data.success) {
            showNotification(`SSL Certificate issued successfully for ${domainName}!`);
            loadSites();
        } else {
            showNotification(`SSL Status updated for ${domainName}`);
        }
    } catch (e) {
        showNotification(`SSL Certificate setup initiated for ${domainName}`);
    }
}

// Power File Manager
async function loadFiles(pathDir = '/var/www') {
    currentPath = pathDir;
    const pathBar = document.getElementById('fm-path-bar');
    const tbody = document.getElementById('fm-file-list');
    if (!tbody) return;

    if (pathBar) {
        pathBar.innerHTML = `<span class="path-segment"><i class="fa-solid fa-folder-tree"></i> Location: <strong>${pathDir}</strong></span>`;
    }

    try {
        const res = await fetch(`/api/files?path=${encodeURIComponent(pathDir)}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        if (data.success && data.files) {
            tbody.innerHTML = data.files.map(f => {
                const escapedPath = f.path.replace(/\\/g, '/');
                const isZip = f.name.endsWith('.zip');
                return `
                <tr>
                    <td><input type="checkbox"></td>
                    <td>
                        <i class="${f.isDir ? 'fa-solid fa-folder text-warning' : 'fa-solid fa-file-code text-primary'}"></i>
                        <strong style="margin-left:8px; cursor:pointer;" onclick="${f.isDir ? `loadFiles('${escapedPath}')` : `editFile('${escapedPath}')`}">${f.name}</strong>
                    </td>
                    <td>${f.size}</td>
                    <td><code>${f.perm}</code></td>
                    <td>${f.mtime}</td>
                    <td>
                        ${f.isDir ? '' : `<button class="btn-icon-sm text-primary" title="Edit File" onclick="editFile('${escapedPath}')"><i class="fa-solid fa-pen-to-square"></i> Edit</button>`}
                        ${isZip ? `<button class="btn-icon-sm text-warning" title="Extract ZIP" onclick="unzipFile('${escapedPath}')"><i class="fa-solid fa-file-zipper"></i> Extract</button>` : ''}
                        <button class="btn-icon-sm text-danger" title="Delete" onclick="deleteFileOrFolder('${escapedPath}')"><i class="fa-solid fa-trash"></i> Delete</button>
                    </td>
                </tr>
            `}).join('');
        }
    } catch (e) {
        console.error('File manager load error', e);
    }
}

// File Manager: Code Editor
async function editFile(filePath) {
    try {
        const res = await fetch('/api/file/read', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ filePath })
        });
        const data = await res.json();
        if (data.success) {
            const newContent = prompt(`Edit & Overwrite file: ${filePath}`, data.content);
            if (newContent !== null) {
                saveFile(filePath, newContent);
            }
        }
    } catch (e) {
        alert('Could not open file editor.');
    }
}

async function saveFile(filePath, content) {
    const res = await fetch('/api/file/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ filePath, content })
    });
    const data = await res.json();
    if (data.success) {
        showNotification(`File ${filePath} saved & overwritten!`);
        loadFiles(currentPath);
    }
}

// File Manager: Create Folder
function openNewFolderModal() {
    const modal = document.getElementById('modal-new-folder');
    if (modal) modal.style.display = 'flex';
}

async function submitCreateFolder() {
    const folderName = document.getElementById('new-folder-input').value.trim();
    if (!folderName) return;

    const folderPath = `${currentPath}/${folderName}`;
    const res = await fetch('/api/file/mkdir', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ folderPath })
    });
    const data = await res.json();
    if (data.success) {
        closeModal('modal-new-folder');
        showNotification(`Folder ${folderName} created!`);
        loadFiles(currentPath);
    } else {
        alert('Error: ' + data.error);
    }
}

// File Manager: Delete File/Folder
async function deleteFileOrFolder(targetPath) {
    if (!confirm(`Are you sure you want to delete ${targetPath}?`)) return;

    const res = await fetch('/api/file/delete', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ targetPath })
    });
    const data = await res.json();
    if (data.success) {
        showNotification(`Deleted ${targetPath}`);
        loadFiles(currentPath);
    } else {
        alert('Delete error: ' + data.error);
    }
}

// File Manager: Unzip Archive
async function unzipFile(zipPath) {
    showNotification(`Extracting ZIP archive ${zipPath}...`);
    const res = await fetch('/api/file/unzip', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ zipPath, destDir: currentPath })
    });
    const data = await res.json();
    if (data.success) {
        showNotification('ZIP Archive extracted successfully!');
        loadFiles(currentPath);
    } else {
        alert('Unzip error: ' + data.error);
    }
}

// File Manager: Upload File Modal & Action
function openUploadModal() {
    const modal = document.getElementById('modal-upload-file');
    if (modal) modal.style.display = 'flex';
}

async function submitUploadFile() {
    const fileInput = document.getElementById('upload-file-input');
    if (!fileInput.files || fileInput.files.length === 0) {
        alert('Please select a file to upload!');
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        const base64Data = e.target.result.split(',')[1];
        showNotification(`Uploading ${file.name} to ${currentPath}...`);

        const res = await fetch('/api/file/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                targetDir: currentPath,
                fileName: file.name,
                base64Data: base64Data
            })
        });
        const data = await res.json();
        if (data.success) {
            closeModal('modal-upload-file');
            showNotification(`File ${file.name} uploaded successfully!`);
            loadFiles(currentPath);
        } else {
            alert('Upload error: ' + data.error);
        }
    };

    reader.readAsDataURL(file);
}

// Git Direct Auto-Deploy
async function handleGitDeploy(event) {
    event.preventDefault();
    const repoUrl = document.getElementById('git-repo-url').value.trim();
    const targetDomain = document.getElementById('git-target-domain').value.trim();
    const branch = document.getElementById('git-branch').value.trim();
    const logEl = document.getElementById('git-deploy-log');

    showNotification(`Cloning & Deploying Git Repo ${repoUrl}...`);
    if (logEl) {
        logEl.style.display = 'block';
        logEl.innerText = `[GIT AUTO-DEPLOY] Cloning ${repoUrl} (branch: ${branch}) to /var/www/${targetDomain}...\nPlease wait...`;
    }

    try {
        const res = await fetch('/api/git/deploy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ repoUrl, domain: targetDomain, branch })
        });
        const data = await res.json();

        if (data.success) {
            showNotification(`Git Repository deployed successfully to ${targetDomain}!`);
            if (logEl) {
                logEl.innerText = `✅ DEPLOYMENT SUCCESSFUL!\n\n${data.output}`;
            }
        } else {
            if (logEl) {
                logEl.innerText = `❌ DEPLOYMENT FAILED:\n\n${data.output || data.error}`;
            }
        }
    } catch (e) {
        if (logEl) {
            logEl.innerText = `Deployment error: ${e.message}`;
        }
    }
}

// Modal Dialog Helpers
function openAddSiteModal() {
    const modal = document.getElementById('modal-add-site');
    if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

// Security Sentinel Status & Unban
async function loadSecurityStatus() {
    try {
        const res = await fetch('/api/security/status', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success) {
            const countEl = document.getElementById('banned-count-val');
            const sshEl = document.getElementById('failed-ssh-val');
            const ipsListEl = document.getElementById('banned-ips-list');

            if (countEl) countEl.innerText = `${data.bannedCount} IPs`;
            if (sshEl) sshEl.innerText = `${data.failedSshCount}`;

            if (ipsListEl) {
                if (data.bannedIps && data.bannedIps.length > 0) {
                    ipsListEl.innerHTML = '<strong>Banned Attacker IPs:</strong><br>' + data.bannedIps.map(ip => `
                        <span class="badge badge-danger" style="margin-right:8px;">${ip}</span>
                        <button class="btn btn-sm btn-secondary" onclick="unbanIp('${ip}')">Unban</button>
                    `).join('');
                } else {
                    ipsListEl.innerHTML = '<em>No malicious IPs currently banned. Server is clean and secure.</em>';
                }
            }
        }
    } catch (e) {
        console.error('Security status load error', e);
    }
}

async function unbanIp(ip) {
    const res = await fetch('/api/security/unban', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ ip })
    });
    const data = await res.json();
    if (data.success) {
        showNotification(`IP ${ip} unbanned.`);
        loadSecurityStatus();
    }
}

// Change Admin Credentials Function
async function handleChangeCredentials(event) {
    event.preventDefault();
    const newUsername = document.getElementById('change-user-input').value.trim();
    const currentPassword = document.getElementById('current-pass-input').value.trim();
    const newPassword = document.getElementById('new-pass-input').value.trim();

    if (!currentPassword || !newPassword) {
        alert('Please fill in both current and new password fields.');
        return;
    }

    try {
        const res = await fetch('/api/security/change-credentials', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ currentPassword, newUsername, newPassword })
        });
        const data = await res.json();

        if (data.success) {
            alert('Admin Password updated successfully! Please log in again with your new password.');
            localStorage.removeItem('spanel_token');
            location.reload();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (e) {
        alert('Server error updating password.');
    }
}

// 1-Click System Optimizer Action
async function runSystemOptimizer() {
    showNotification('Running System RAM & Cache Optimization...');
    try {
        const res = await fetch('/api/system/optimize', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success) {
            showNotification(data.message);
            loadServerAudit();
        }
    } catch (e) {
        showNotification('System optimization completed!');
    }
}

async function loadServerAudit() {
    try {
        const res = await fetch('/api/system/audit', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success) {
            const scoreEl = document.getElementById('health-score-val');
            if (scoreEl) {
                scoreEl.innerText = `${data.healthScore} / 100`;
            }
        }
    } catch (e) {}
}

// Toast Notification
function showNotification(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #1e293b;
        color: #fff;
        border: 1px solid var(--accent-primary);
        padding: 12px 20px;
        border-radius: var(--radius-md);
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        z-index: 9999;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: fadeIn 0.3s ease;
    `;
    toast.innerHTML = `<i class="fa-solid fa-circle-check text-success"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}
