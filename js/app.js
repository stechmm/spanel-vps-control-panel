/**
 * SPanel Pro - Power Enterprise Control Panel Suite
 */

let currentPath = '/var/www';
let currentFileList = [];
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

            // Auto-load tab data on switch
            if (targetTab === 'security') loadSecurityStatus();
            if (targetTab === 'docker')    loadContainers();
            if (targetTab === 'processes') loadProcesses();
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

// 5. Power File Manager (Robust Single & Double Click + Breadcrumbs)
function renderBreadcrumb(pathDir) {
    const pathBar = document.getElementById('fm-path-bar');
    if (!pathBar) return;

    const parts = pathDir.split('/').filter(Boolean);
    let cumulativePath = '';
    let html = `<span class="path-segment" style="cursor:pointer;" onclick="loadFiles('/var/www')"><i class="fa-solid fa-house"></i> Root</span>`;

    parts.forEach(part => {
        cumulativePath += '/' + part;
        const target = cumulativePath;
        html += ` <span style="color:var(--text-muted);">/</span> <span class="path-segment" style="cursor:pointer; font-weight:600;" onclick="loadFiles('${target}')">${part}</span>`;
    });

    pathBar.innerHTML = html;
}

async function loadFiles(pathDir = '/var/www') {
    currentPath = pathDir;
    renderBreadcrumb(pathDir);

    const tbody = document.getElementById('fm-file-list');
    if (!tbody) return;

    try {
        const res = await fetch(`/api/files?path=${encodeURIComponent(pathDir)}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        if (data.success && data.files) {
            currentFileList = data.files;
            tbody.innerHTML = data.files.map((f, i) => {
                const isZip = f.name.endsWith('.zip');
                return `
                <tr style="cursor:pointer;" onclick="handleFileItemClick(${i})" ondblclick="handleFileItemClick(${i})">
                    <td><input type="checkbox" onclick="event.stopPropagation()"></td>
                    <td>
                        <i class="${f.isDir ? 'fa-solid fa-folder text-warning' : 'fa-solid fa-file-code text-primary'}"></i>
                        <strong style="margin-left:8px; color:#f8fafc;">${f.name}</strong>
                    </td>
                    <td>${f.size}</td>
                    <td><code>${f.perm}</code></td>
                    <td>${f.mtime}</td>
                    <td onclick="event.stopPropagation()">
                        ${f.isDir ? 
                            `<button class="btn-icon-sm text-primary" title="Open Folder" onclick="loadFiles('${f.path.replace(/\\/g, '/')}')"><i class="fa-solid fa-folder-open"></i> Open</button>` : 
                            `<button class="btn-icon-sm text-primary" title="Edit File" onclick="editFileIndex(${i})"><i class="fa-solid fa-pen-to-square"></i> Edit</button>`
                        }
                        ${isZip ? `<button class="btn-icon-sm text-warning" title="Extract ZIP" onclick="unzipFileIndex(${i})"><i class="fa-solid fa-file-zipper"></i> Extract</button>` : ''}
                        <button class="btn-icon-sm text-danger" title="Delete" onclick="deleteFileIndex(${i})"><i class="fa-solid fa-trash"></i> Delete</button>
                    </td>
                </tr>
            `}).join('');
        }
    } catch (e) {
        console.error('File manager load error', e);
    }
}

function handleFileItemClick(index) {
    const fileItem = currentFileList[index];
    if (!fileItem) return;

    if (fileItem.isDir) {
        loadFiles(fileItem.path.replace(/\\/g, '/'));
    } else {
        editFileIndex(index);
    }
}

async function editFileIndex(index) {
    const fileItem = currentFileList[index];
    if (!fileItem) return;

    const filePath = fileItem.path.replace(/\\/g, '/');
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
            document.getElementById('editor-file-title').innerText = `Edit: ${fileItem.name}`;
            document.getElementById('editor-file-path').value = filePath;
            document.getElementById('editor-content-area').value = data.content;
            
            const modal = document.getElementById('modal-edit-file');
            if (modal) modal.style.display = 'flex';
        } else {
            alert('Cannot read file: ' + data.error);
        }
    } catch (e) {
        alert('Could not open file editor.');
    }
}

async function submitSaveFile() {
    const filePath = document.getElementById('editor-file-path').value;
    const content = document.getElementById('editor-content-area').value;

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
        closeModal('modal-edit-file');
        showNotification(`File ${filePath} saved & overwritten successfully!`);
        loadFiles(currentPath);
    } else {
        alert('Save error: ' + data.error);
    }
}

function unzipFileIndex(index) {
    const fileItem = currentFileList[index];
    if (fileItem) unzipFile(fileItem.path.replace(/\\/g, '/'));
}

function deleteFileIndex(index) {
    const fileItem = currentFileList[index];
    if (fileItem) deleteFileOrFolder(fileItem.path.replace(/\\/g, '/'));
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

// ============================================================
// Docker Container Manager
// ============================================================
async function loadContainers() {
    const tbody = document.getElementById('docker-container-list');
    const badge = document.getElementById('docker-count-badge');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Fetching containers...</td></tr>`;

    try {
        const res = await fetch('/api/containers', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        if (!data.success) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">${data.message || 'Error loading containers'}</td></tr>`;
            return;
        }

        if (badge) badge.innerText = `${data.containers.length} containers`;

        if (!data.containers.length) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">${data.message || 'No Docker containers found on this server.'}</td></tr>`;
            return;
        }

        tbody.innerHTML = data.containers.map(c => `
            <tr>
                <td><code style="font-size:11px;">${c.id}</code></td>
                <td><strong>${c.name}</strong></td>
                <td style="font-size:12px;color:var(--text-muted);">${c.image}</td>
                <td>
                    <span class="badge ${c.running ? 'badge-success' : 'badge-danger'}">
                        <i class="fa-solid fa-circle" style="font-size:8px;"></i>
                        ${c.status}
                    </span>
                </td>
                <td>${c.cpu}</td>
                <td>${c.mem}</td>
                <td style="font-size:11px;color:var(--text-muted);">${c.ports || '--'}</td>
                <td onclick="event.stopPropagation()">
                    <button class="btn-icon-sm text-success" onclick="containerAction('${c.name}','start')" title="Start"><i class="fa-solid fa-play"></i></button>
                    <button class="btn-icon-sm text-warning" onclick="containerAction('${c.name}','restart')" title="Restart"><i class="fa-solid fa-arrows-rotate"></i></button>
                    <button class="btn-icon-sm text-danger" onclick="containerAction('${c.name}','stop')" title="Stop"><i class="fa-solid fa-stop"></i></button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#ef4444;">Error: ${e.message}</td></tr>`;
    }
}

async function containerAction(containerName, action) {
    showNotification(`Docker: ${action} → ${containerName}...`);
    try {
        const res = await fetch('/api/container/action', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ containerName, action })
        });
        const data = await res.json();
        if (data.success) {
            showNotification(`✅ Container ${containerName} ${action} successful!`);
            setTimeout(loadContainers, 1500);
        } else {
            alert('Container action failed: ' + (data.output || data.error));
        }
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

// ============================================================
// Background Process Monitor (PM2 + Python AI Agents)
// ============================================================
async function loadProcesses() {
    const pm2Tbody  = document.getElementById('pm2-process-list');
    const pyTbody   = document.getElementById('python-process-list');
    const pm2Badge  = document.getElementById('pm2-process-count');
    const pyBadge   = document.getElementById('python-process-count');

    if (pm2Tbody) pm2Tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;
    if (pyTbody)  pyTbody.innerHTML  = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Scanning...</td></tr>`;

    try {
        const res = await fetch('/api/processes', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        // --- PM2 Apps ---
        if (pm2Badge) pm2Badge.innerText = `${data.pm2.length} apps`;
        if (pm2Tbody) {
            if (!data.pm2.length) {
                pm2Tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">No PM2 apps running.</td></tr>`;
            } else {
                pm2Tbody.innerHTML = data.pm2.map(p => {
                    const statusClass = p.status === 'online' ? 'badge-success' : p.status === 'stopped' ? 'badge-secondary' : 'badge-danger';
                    return `
                    <tr>
                        <td><strong>#${p.id}</strong></td>
                        <td>
                            <i class="fa-brands fa-node-js text-success"></i>
                            <strong style="margin-left:6px;">${p.name}</strong>
                            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${p.exec.split('/').pop()}</div>
                        </td>
                        <td><span class="badge ${statusClass}">${p.status}</span></td>
                        <td>${p.cpu}</td>
                        <td>${p.ram}</td>
                        <td style="font-size:12px;">${p.pid}</td>
                        <td><span class="badge ${p.restarts > 5 ? 'badge-danger' : 'badge-secondary'}">${p.restarts}</span></td>
                        <td onclick="event.stopPropagation()">
                            <button class="btn-icon-sm text-success" onclick="pm2Action(${p.id},'restart')" title="Restart"><i class="fa-solid fa-arrows-rotate"></i></button>
                            <button class="btn-icon-sm text-danger" onclick="pm2Action(${p.id},'stop')" title="Stop"><i class="fa-solid fa-stop"></i></button>
                        </td>
                    </tr>`;
                }).join('');
            }
        }

        // --- Python AI Agents ---
        if (pyBadge) pyBadge.innerText = `${data.python.length} agents`;
        if (pyTbody) {
            if (!data.python.length) {
                pyTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No Python AI agents running.</td></tr>`;
            } else {
                pyTbody.innerHTML = data.python.map(p => `
                    <tr>
                        <td><code>${p.pid}</code></td>
                        <td style="font-size:12px; max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            <i class="fa-brands fa-python text-warning"></i>
                            ${p.name}
                        </td>
                        <td>${p.cpu}</td>
                        <td>${p.ram}</td>
                        <td>${p.uptime}</td>
                        <td><span class="badge badge-success">running</span></td>
                    </tr>
                `).join('');
            }
        }
    } catch (e) {
        if (pm2Tbody) pm2Tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#ef4444;">Error: ${e.message}</td></tr>`;
    }
}
