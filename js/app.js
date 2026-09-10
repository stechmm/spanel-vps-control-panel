/**
 * SPanel Pro - Power Enterprise Control Panel Suite
 */

let currentPath = '/var/www';
let currentFileList = [];
let selectedItems = new Set();
let pathHistory = ['/var/www'];
let historyIndex = 0;
let authToken = localStorage.getItem('spanel_token') || '';
let tempOtpToken = '';

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
            postLoginSuccess();
        } else {
            showLoginScreen();
        }
    } catch (e) {
        showLoginScreen();
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
    if (errorEl) {
        errorEl.innerText = '';
        errorEl.style.display = 'none';
    }

    const deviceToken = localStorage.getItem('spanel_trusted_device') || '';

    try {
        const btn = document.getElementById('btn-login-pass');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking...';

        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: passInput, deviceToken: deviceToken })
        });
        const data = await res.json();
        if (btn) btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Continue';

        if (data.success && data.trustedDevice && data.token) {
            // Direct login: Browser is recognized as a 30-day trusted device!
            authToken = data.token;
            localStorage.setItem('spanel_token', authToken);
            hideLoginScreen();
            postLoginSuccess('Welcome back! Trusted device recognized (30-day active).');
            return;
        }

        if (data.success && data.requireOtp) {
            // Step 2: Show 6-digit verification code screen
            tempOtpToken = data.tempToken;
            const stepPass = document.getElementById('login-step-pass');
            const stepOtp = document.getElementById('login-step-otp');
            const emailTarget = document.getElementById('otp-target-email');
            const previewBanner = document.getElementById('otp-preview-banner');
            const previewCode = document.getElementById('otp-preview-code');
            const otpInput = document.getElementById('otp-code-input');

            if (stepPass) stepPass.style.display = 'none';
            if (stepOtp) stepOtp.style.display = 'block';
            if (emailTarget) emailTarget.textContent = data.email || 'shwetun@stech.asia';

            if (data.previewOtp && previewBanner && previewCode) {
                previewCode.textContent = data.previewOtp;
                previewBanner.style.display = 'block';
            }

            if (otpInput) {
                otpInput.value = '';
                setTimeout(() => otpInput.focus(), 150);
            }
            return;
        }

        if (errorEl) {
            errorEl.innerText = data.error || 'Invalid admin password!';
            errorEl.style.display = 'block';
        }
    } catch (e) {
        const btn = document.getElementById('btn-login-pass');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Continue';
        if (errorEl) {
            errorEl.innerText = 'Login server error: ' + e.message;
            errorEl.style.display = 'block';
        }
    }
}

async function handleVerifyOtp(event) {
    event.preventDefault();
    const otpInput = document.getElementById('otp-code-input');
    const rememberCb = document.getElementById('remember-device-cb');
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('btn-verify-otp');

    if (errorEl) {
        errorEl.innerText = '';
        errorEl.style.display = 'none';
    }

    const otpCode = (otpInput ? otpInput.value : '').trim();
    const rememberDevice = rememberCb ? rememberCb.checked : false;

    if (!otpCode || otpCode.length !== 6) {
        if (errorEl) {
            errorEl.innerText = 'Please enter a valid 6-digit verification code.';
            errorEl.style.display = 'block';
        }
        return;
    }

    try {
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';

        const res = await fetch('/api/login/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tempToken: tempOtpToken,
                otpCode: otpCode,
                rememberDevice: rememberDevice
            })
        });

        const data = await res.json();
        if (btn) btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> Verify & Unlock';

        if (data.success && data.token) {
            authToken = data.token;
            localStorage.setItem('spanel_token', authToken);

            if (data.deviceToken) {
                localStorage.setItem('spanel_trusted_device', data.deviceToken);
            }

            hideLoginScreen();
            backToPassStep();
            postLoginSuccess(rememberDevice ? 'Browser verified & trusted for 30 days!' : '2-Step Verification successful!');
        } else {
            if (errorEl) {
                errorEl.innerText = data.error || 'Verification failed. Incorrect code.';
                errorEl.style.display = 'block';
            }
        }
    } catch (e) {
        if (btn) btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> Verify & Unlock';
        if (errorEl) {
            errorEl.innerText = 'Verification server error: ' + e.message;
            errorEl.style.display = 'block';
        }
    }
}

async function handleResendOtp() {
    const errorEl = document.getElementById('login-error');
    const previewBanner = document.getElementById('otp-preview-banner');
    const previewCode = document.getElementById('otp-preview-code');

    try {
        const res = await fetch('/api/login/resend-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tempToken: tempOtpToken })
        });
        const data = await res.json();

        if (data.success) {
            if (data.previewOtp && previewBanner && previewCode) {
                previewCode.textContent = data.previewOtp;
                previewBanner.style.display = 'block';
            }
            try { showNotification('New verification code generated!'); } catch (e) {}
            if (errorEl) {
                errorEl.innerText = '';
                errorEl.style.display = 'none';
            }
        } else {
            if (errorEl) {
                errorEl.innerText = data.error || 'Failed to resend code.';
                errorEl.style.display = 'block';
            }
        }
    } catch (e) {
        if (errorEl) {
            errorEl.innerText = 'Failed to resend code: ' + e.message;
            errorEl.style.display = 'block';
        }
    }
}

function backToPassStep() {
    const stepPass = document.getElementById('login-step-pass');
    const stepOtp = document.getElementById('login-step-otp');
    const errorEl = document.getElementById('login-error');

    if (stepPass) stepPass.style.display = 'block';
    if (stepOtp) stepOtp.style.display = 'none';
    if (errorEl) {
        errorEl.innerText = '';
        errorEl.style.display = 'none';
    }
}

function handleLogout() {
    authToken = '';
    localStorage.removeItem('spanel_token');
    showLoginScreen();
    backToPassStep();
    try { showNotification('Session locked. Logged out securely.'); } catch (e) {}
}

function postLoginSuccess(msg) {
    try { if (typeof fetchLiveMetrics === 'function') fetchLiveMetrics(); } catch (e) {}
    try { loadSites(); } catch (e) {}
    try { loadNodeApps(); } catch (e) {}
    try { loadDnsRecords(); } catch (e) {}
    try { loadMailAccounts(); } catch (e) {}
    try { loadFiles(currentPath); } catch (e) {}
    if (msg) {
        try { showNotification(msg); } catch (e) {}
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
            if (targetTab === 'security')    loadSecurityStatus();
            if (targetTab === 'docker')      loadContainers();
            if (targetTab === 'processes')   loadProcesses();
            if (targetTab === 'filemanager') { loadFiles(currentPath); loadDirectoryTree('/var/www'); }
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

// ============================================================
// 1-Click App & Website Installer Controller
// ============================================================
function openAddSiteModal() {
    const modal = document.getElementById('modal-add-site');
    if (!modal) return;

    // Reset fields
    const domainInput = document.getElementById('app-domain-input');
    const portInput = document.getElementById('app-port-input');
    const scriptInput = document.getElementById('app-script-input');
    const gitUrl = document.getElementById('app-git-url');
    const gitToken = document.getElementById('app-git-token');
    const privateGitBox = document.getElementById('private-git-box');
    const zipInput = document.getElementById('app-zip-file');
    const statusBox = document.getElementById('app-deploy-status');
    const btnSubmit = document.getElementById('btn-submit-app-deploy');

    if (domainInput) domainInput.value = '';
    if (portInput) portInput.value = '';
    if (scriptInput) scriptInput.value = '';
    if (gitUrl) gitUrl.value = '';
    if (gitToken) gitToken.value = '';
    if (privateGitBox) privateGitBox.style.display = 'none';
    if (zipInput) zipInput.value = '';
    if (statusBox) statusBox.style.display = 'none';
    if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i class="fa-solid fa-rocket"></i> Install & Connect Domain`;
    }

    togglePlatformOptions();
    toggleSourceInputs();

    modal.style.display = 'flex';
    fetchNextFreePort();
    setTimeout(() => domainInput && domainInput.focus(), 100);
}

function togglePrivateGitHelp() {
    const box = document.getElementById('private-git-box');
    if (!box) return;
    const isHidden = box.style.display === 'none';
    box.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
        loadServerDeployKey();
    }
}

function togglePrivateAuthType() {
    const type = document.querySelector('input[name="private_auth_type"]:checked')?.value || 'token';
    const tokenBox = document.getElementById('private-auth-token-box');
    const sshBox = document.getElementById('private-auth-ssh-box');
    if (tokenBox) tokenBox.style.display = type === 'token' ? 'block' : 'none';
    if (sshBox) sshBox.style.display = type === 'ssh' ? 'block' : 'none';
    if (type === 'ssh') loadServerDeployKey();
}

async function loadServerDeployKey() {
    const keyInput = document.getElementById('server-deploy-key-input');
    if (!keyInput) return;
    try {
        const res = await fetch('/api/server-deploy-key', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success && data.publicKey) {
            keyInput.value = data.publicKey;
        }
    } catch (e) {
        keyInput.value = 'Failed to load key';
    }
}

function copyDeployKey() {
    const keyInput = document.getElementById('server-deploy-key-input');
    if (!keyInput || !keyInput.value) return;
    navigator.clipboard.writeText(keyInput.value).then(() => {
        showNotification('✅ Server SSH Deploy Key copied to clipboard!');
    }).catch(() => {
        keyInput.select();
        document.execCommand('copy');
        showNotification('✅ Key copied to clipboard!');
    });
}

async function fetchNextFreePort() {
    const portInput = document.getElementById('app-port-input');
    const badge = document.getElementById('badge-auto-port');
    try {
        if (badge) badge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Checking...`;
        const res = await fetch('/api/next-free-port', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success && data.port) {
            if (portInput) {
                portInput.placeholder = `Auto (Next free: ${data.port})`;
            }
            if (badge) {
                badge.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Free Port: ${data.port}`;
            }
            return data.port;
        }
    } catch (e) {}
    if (badge) badge.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Auto Free Port`;
    return null;
}

function togglePlatformOptions() {
    const platform = document.getElementById('app-platform-select')?.value || 'static';
    const proxyGroup = document.getElementById('proxy-settings-group');
    const scriptWrapper = document.getElementById('node-script-wrapper');

    if (proxyGroup) {
        if (platform === 'static') {
            proxyGroup.style.display = 'none';
        } else {
            proxyGroup.style.display = 'block';
            if (scriptWrapper) {
                scriptWrapper.style.display = platform === 'nodejs' ? 'block' : 'none';
            }
        }
    }
}

function toggleSourceInputs() {
    const selectedSource = document.querySelector('input[name="app_source"]:checked')?.value || 'git';
    const gitBox = document.getElementById('source-git-box');
    const zipBox = document.getElementById('source-zip-box');
    const blankBox = document.getElementById('source-blank-box');

    if (gitBox)   gitBox.style.display   = selectedSource === 'git'   ? 'flex'  : 'none';
    if (zipBox)   zipBox.style.display   = selectedSource === 'zip'   ? 'block' : 'none';
    if (blankBox) blankBox.style.display = selectedSource === 'blank' ? 'block' : 'none';
}

async function submitInstallApp() {
    const domainInput = document.getElementById('app-domain-input');
    const domain = (domainInput?.value || '').trim().toLowerCase();
    const appType = document.getElementById('app-platform-select')?.value || 'static';
    const sourceType = document.querySelector('input[name="app_source"]:checked')?.value || 'blank';
    const rawPort = (document.getElementById('app-port-input')?.value || '').trim();
    const port = rawPort && !isNaN(parseInt(rawPort, 10)) ? parseInt(rawPort, 10) : 'auto';
    const rawScript = (document.getElementById('app-script-input')?.value || '').trim();
    const startScript = rawScript && rawScript.toLowerCase() !== 'auto' ? rawScript : 'auto';
    const repoUrl = (document.getElementById('app-git-url')?.value || '').trim();
    const gitToken = (document.getElementById('app-git-token')?.value || '').trim();
    const branch = (document.getElementById('app-git-branch')?.value || 'main').trim();
    const zipInput = document.getElementById('app-zip-file');

    const statusBox = document.getElementById('app-deploy-status');
    const btnSubmit = document.getElementById('btn-submit-app-deploy');

    if (!domain) {
        alert('Please enter a domain or subdomain name!');
        if (domainInput) domainInput.focus();
        return;
    }

    if (sourceType === 'git' && !repoUrl) {
        alert('Please enter a Git repository URL!');
        return;
    }

    if (sourceType === 'zip' && (!zipInput.files || zipInput.files.length === 0)) {
        alert('Please select a .zip archive file to upload!');
        return;
    }

    // Set UI loading state
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Installing Application...`;
    }
    if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.style.background = 'rgba(99, 102, 241, 0.15)';
        statusBox.style.color = '#818cf8';
        statusBox.style.border = '1px solid rgba(99, 102, 241, 0.3)';
        statusBox.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Configuring VirtualHost for <strong>${domain}</strong>, deploying files & setting up Nginx...`;
    }

    const payload = {
        domain,
        appType,
        sourceType,
        port,
        startScript,
        repoUrl,
        branch,
        gitToken
    };

    const sendRequest = async (finalPayload) => {
        try {
            const res = await fetch('/api/create-site', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(finalPayload)
            });
            const data = await res.json();

            if (data.success) {
                const portInfo = data.allocatedPort ? ` (Port: <strong>${data.allocatedPort}</strong>)` : '';
                const scriptInfo = data.detectedStartScript ? ` [Entry File: <code>${data.detectedStartScript}</code>]` : '';
                if (statusBox) {
                    statusBox.style.background = 'rgba(16, 185, 129, 0.15)';
                    statusBox.style.color = '#34d399';
                    statusBox.style.border = '1px solid rgba(16, 185, 129, 0.3)';
                    statusBox.innerHTML = `✅ <strong>${domain}</strong> is successfully deployed and connected!${portInfo}${scriptInfo}`;
                }
                showNotification(`✅ App ${domain} installed successfully!${portInfo ? ` on port ${data.allocatedPort}` : ''}`);
                setTimeout(() => {
                    closeModal('modal-add-site');
                    loadSites();
                    loadNodeApps();
                }, 1500);
            } else {
                if (statusBox) {
                    statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
                    statusBox.style.color = '#f87171';
                    statusBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
                    statusBox.innerHTML = `❌ Error: ${data.error || 'Installation failed'}<br><pre style="margin-top:6px; font-size:11px;">${data.nginxOutput || ''}</pre>`;
                }
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.innerHTML = `<i class="fa-solid fa-rotate-right"></i> Try Again`;
                }
            }
        } catch (err) {
            if (statusBox) {
                statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
                statusBox.style.color = '#f87171';
                statusBox.innerHTML = `❌ Network Error: ${err.message}`;
            }
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = `<i class="fa-solid fa-rotate-right"></i> Try Again`;
            }
        }
    };

    // If ZIP upload, read base64 first
    if (sourceType === 'zip' && zipInput.files && zipInput.files[0]) {
        const file = zipInput.files[0];
        const reader = new FileReader();
        reader.onload = () => {
            payload.zipBase64 = reader.result.split(',')[1];
            sendRequest(payload);
        };
        reader.readAsDataURL(file);
    } else {
        sendRequest(payload);
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

// ============================================================
// cPanel File Manager Engine Suite
// ============================================================

async function loadFiles(pathDir = '/var/www', addToHistory = true) {
    currentPath = pathDir;
    selectedItems.clear();
    updateToolbarState();

    // Update path input box
    const pathInput = document.getElementById('cp-path-input');
    if (pathInput) pathInput.value = pathDir;

    // History tracking
    if (addToHistory) {
        if (historyIndex < pathHistory.length - 1) {
            pathHistory = pathHistory.slice(0, historyIndex + 1);
        }
        if (pathHistory[pathHistory.length - 1] !== pathDir) {
            pathHistory.push(pathDir);
            historyIndex = pathHistory.length - 1;
        }
    }

    const tbody = document.getElementById('fm-file-list');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading directory...</td></tr>`;

    try {
        const res = await fetch(`/api/files?path=${encodeURIComponent(pathDir)}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        if (data.success && data.files) {
            currentFileList = data.files;

            // Sort: folders first, then files
            currentFileList.sort((a, b) => {
                if (a.isDir && !b.isDir) return -1;
                if (!a.isDir && b.isDir) return 1;
                return a.name.localeCompare(b.name);
            });

            if (currentFileList.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);"><i class="fa-regular fa-folder-open"></i> This directory is empty.</td></tr>`;
            } else {
                tbody.innerHTML = currentFileList.map((f, i) => {
                    const isZip = f.name.endsWith('.zip') || f.name.endsWith('.tar.gz');
                    const iconClass = f.isDir 
                        ? 'fa-solid fa-folder text-warning' 
                        : (isZip ? 'fa-solid fa-file-zipper text-warning' : (f.name.endsWith('.php') || f.name.endsWith('.js') || f.name.endsWith('.html') ? 'fa-solid fa-file-code text-primary' : 'fa-regular fa-file text-muted'));

                    return `
                    <tr id="file-row-${i}" onclick="handleFileRowClick(event, ${i})" ondblclick="handleFileRowDblClick(${i})">
                        <td style="text-align:center;" onclick="event.stopPropagation()">
                            <input type="checkbox" id="file-cb-${i}" onchange="toggleItemSelect(${i}, this.checked)">
                        </td>
                        <td>
                            <i class="${iconClass}" style="margin-right:8px; font-size:14px;"></i>
                            <strong style="color:#f8fafc;">${f.name}</strong>
                        </td>
                        <td><span style="font-size:12px; color:var(--text-muted);">${f.size}</span></td>
                        <td><code style="font-size:11px;">${f.perm}</code></td>
                        <td><span style="font-size:12px; color:var(--text-muted);">${f.mtime}</span></td>
                    </tr>`;
                }).join('');
            }

            // Sync directory tree
            loadDirectoryTree('/var/www');
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ef4444; padding:20px;">Error: ${data.error || 'Failed to read directory'}</td></tr>`;
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ef4444; padding:20px;">Load error: ${e.message}</td></tr>`;
    }
}

// Single click = Select row
function handleFileRowClick(event, index) {
    if (event.ctrlKey || event.metaKey) {
        // Multi-select toggle
        if (selectedItems.has(index)) {
            selectedItems.delete(index);
        } else {
            selectedItems.add(index);
        }
    } else {
        // Single select
        selectedItems.clear();
        selectedItems.add(index);
    }
    syncRowSelectionUI();
    updateToolbarState();
}

// Double click = Open folder or Edit file
function handleFileRowDblClick(index) {
    const item = currentFileList[index];
    if (!item) return;
    if (item.isDir) {
        loadFiles(item.path.replace(/\\/g, '/'));
    } else {
        editFileByPath(item.path.replace(/\\/g, '/'), item.name);
    }
}

function toggleItemSelect(index, isChecked) {
    if (isChecked) {
        selectedItems.add(index);
    } else {
        selectedItems.delete(index);
    }
    syncRowSelectionUI();
    updateToolbarState();
}

function syncRowSelectionUI() {
    currentFileList.forEach((_, i) => {
        const row = document.getElementById(`file-row-${i}`);
        const cb = document.getElementById(`file-cb-${i}`);
        const isSel = selectedItems.has(i);
        if (row) row.classList.toggle('row-selected', isSel);
        if (cb) cb.checked = isSel;
    });

    const selectAllBox = document.getElementById('cp-select-all-box');
    if (selectAllBox) {
        selectAllBox.checked = currentFileList.length > 0 && selectedItems.size === currentFileList.length;
    }
}

function toggleSelectAll(selectAll) {
    selectedItems.clear();
    if (selectAll) {
        currentFileList.forEach((_, i) => selectedItems.add(i));
    }
    syncRowSelectionUI();
    updateToolbarState();
}

// Update cPanel Toolbar active/disabled states
function updateToolbarState() {
    const count = selectedItems.size;
    const firstIdx = selectedItems.values().next().value;
    const firstItem = firstIdx !== undefined ? currentFileList[firstIdx] : null;
    const isSingle = count === 1;
    const isFile = isSingle && firstItem && !firstItem.isDir;
    const isZip = isSingle && firstItem && (firstItem.name.endsWith('.zip') || firstItem.name.endsWith('.tar.gz'));

    const setBtn = (id, enabled) => {
        const el = document.getElementById(id);
        if (el) el.disabled = !enabled;
    };

    setBtn('cp-btn-copy', count > 0);
    setBtn('cp-btn-move', count > 0);
    setBtn('cp-btn-download', isFile);
    setBtn('cp-btn-delete', count > 0);
    setBtn('cp-btn-rename', isSingle);
    setBtn('cp-btn-edit', isFile);
    setBtn('cp-btn-perms', isSingle);
    setBtn('cp-btn-view', isFile);
    setBtn('cp-btn-extract', isZip);
    setBtn('cp-btn-compress', count > 0);
}

// Navigation helpers
function navigateToPathInput() {
    const input = document.getElementById('cp-path-input');
    if (input && input.value.trim()) {
        loadFiles(input.value.trim());
    }
}

function navigateUpLevel() {
    if (currentPath === '/var/www' || currentPath === '/') return;
    const parts = currentPath.replace(/\/+$/, '').split('/');
    parts.pop();
    const parentPath = parts.join('/') || '/var/www';
    loadFiles(parentPath);
}

function navigateBack() {
    if (historyIndex > 0) {
        historyIndex--;
        loadFiles(pathHistory[historyIndex], false);
    }
}

function navigateForward() {
    if (historyIndex < pathHistory.length - 1) {
        historyIndex++;
        loadFiles(pathHistory[historyIndex], false);
    }
}

// Folder Tree Navigation
async function loadDirectoryTree(rootPath = '/var/www') {
    const treeEl = document.getElementById('cpanel-dir-tree');
    if (!treeEl) return;

    try {
        const res = await fetch(`/api/file/tree?path=${encodeURIComponent(rootPath)}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success && data.folders) {
            let html = `
                <div class="tree-node ${currentPath === '/var/www' ? 'active' : ''}" onclick="loadFiles('/var/www')">
                    <i class="fa-solid fa-house" style="color:#38bdf8;"></i>
                    <span>/var/www</span>
                </div>
            `;
            data.folders.forEach(f => {
                const isActive = currentPath === f.path;
                html += `
                <div class="tree-node ${isActive ? 'active' : ''}" style="padding-left: 20px;" onclick="loadFiles('${f.path}')">
                    <i class="fa-solid fa-folder folder-icon"></i>
                    <span>${f.name}</span>
                </div>`;
            });
            treeEl.innerHTML = html;
        }
    } catch (e) {}
}

// ============================================================
// cPanel Action Handlers
// ============================================================

// 1. Create File
function openNewFileModal() {
    const dirHint = document.getElementById('new-file-dir-hint');
    const input = document.getElementById('new-file-input');
    if (dirHint) dirHint.innerText = currentPath;
    if (input) input.value = '';
    const modal = document.getElementById('modal-new-file');
    if (modal) modal.style.display = 'flex';
    setTimeout(() => input && input.focus(), 100);
}

async function submitCreateFile() {
    const fileName = document.getElementById('new-file-input').value.trim();
    if (!fileName) {
        alert('Please enter a file name');
        return;
    }
    const res = await fetch('/api/file/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ targetDir: currentPath, fileName })
    });
    const data = await res.json();
    if (data.success) {
        closeModal('modal-new-file');
        showNotification(data.message);
        loadFiles(currentPath);
    } else {
        alert('Create file error: ' + data.error);
    }
}

// 2. Create Folder
function openNewFolderModal() {
    const input = document.getElementById('new-folder-input');
    if (input) input.value = '';
    const modal = document.getElementById('modal-new-folder');
    if (modal) modal.style.display = 'flex';
    setTimeout(() => input && input.focus(), 100);
}

async function submitCreateFolder() {
    const folderName = document.getElementById('new-folder-input').value.trim();
    if (!folderName) return;

    const folderPath = `${currentPath}/${folderName}`;
    const res = await fetch('/api/file/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
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

// 3. Rename File/Folder
function openRenameModal() {
    const firstIdx = selectedItems.values().next().value;
    const item = currentFileList[firstIdx];
    if (!item) return;

    document.getElementById('rename-target-path').value = item.path.replace(/\\/g, '/');
    const input = document.getElementById('rename-new-name');
    if (input) input.value = item.name;

    const modal = document.getElementById('modal-rename-file');
    if (modal) modal.style.display = 'flex';
    setTimeout(() => input && input.focus(), 100);
}

async function submitRename() {
    const oldPath = document.getElementById('rename-target-path').value;
    const newName = document.getElementById('rename-new-name').value.trim();
    if (!newName) return;

    const res = await fetch('/api/file/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ oldPath, newName })
    });
    const data = await res.json();
    if (data.success) {
        closeModal('modal-rename-file');
        showNotification(data.message);
        loadFiles(currentPath);
    } else {
        alert('Rename error: ' + data.error);
    }
}

// 4. Copy Item
function openCopyModal() {
    const firstIdx = selectedItems.values().next().value;
    const item = currentFileList[firstIdx];
    if (!item) return;

    document.getElementById('copy-source-path').value = item.path.replace(/\\/g, '/');
    document.getElementById('copy-source-label').innerText = item.name;
    document.getElementById('copy-target-dir').value = currentPath;

    const modal = document.getElementById('modal-copy-file');
    if (modal) modal.style.display = 'flex';
}

async function submitCopy() {
    const sourcePath = document.getElementById('copy-source-path').value;
    const targetDir = document.getElementById('copy-target-dir').value.trim();
    if (!targetDir) return;

    const res = await fetch('/api/file/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ sourcePath, targetDir })
    });
    const data = await res.json();
    if (data.success) {
        closeModal('modal-copy-file');
        showNotification(data.message);
        loadFiles(currentPath);
    } else {
        alert('Copy error: ' + data.error);
    }
}

// 5. Move Item
function openMoveModal() {
    const firstIdx = selectedItems.values().next().value;
    const item = currentFileList[firstIdx];
    if (!item) return;

    document.getElementById('move-source-path').value = item.path.replace(/\\/g, '/');
    document.getElementById('move-source-label').innerText = item.name;
    document.getElementById('move-target-dir').value = currentPath;

    const modal = document.getElementById('modal-move-file');
    if (modal) modal.style.display = 'flex';
}

async function submitMove() {
    const sourcePath = document.getElementById('move-source-path').value;
    const targetDir = document.getElementById('move-target-dir').value.trim();
    if (!targetDir) return;

    const res = await fetch('/api/file/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ sourcePath, targetDir })
    });
    const data = await res.json();
    if (data.success) {
        closeModal('modal-move-file');
        showNotification(data.message);
        loadFiles(currentPath);
    } else {
        alert('Move error: ' + data.error);
    }
}

// 6. Permissions (Chmod)
function openChmodModal() {
    const firstIdx = selectedItems.values().next().value;
    const item = currentFileList[firstIdx];
    if (!item) return;

    document.getElementById('chmod-target-path').value = item.path.replace(/\\/g, '/');
    document.getElementById('chmod-target-label').innerText = `${item.name} (${item.perm})`;
    parsePermOctal(item.perm);

    const modal = document.getElementById('modal-chmod-file');
    if (modal) modal.style.display = 'flex';
}

function parsePermOctal(octalStr) {
    const digits = octalStr.replace(/^0+/, '').padStart(3, '0');
    const u = parseInt(digits[0]) || 0;
    const g = parseInt(digits[1]) || 0;
    const o = parseInt(digits[2]) || 0;

    const setCb = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
    setCb('perm-ur', u & 4); setCb('perm-uw', u & 2); setCb('perm-ux', u & 1);
    setCb('perm-gr', g & 4); setCb('perm-gw', g & 2); setCb('perm-gx', g & 1);
    setCb('perm-or', o & 4); setCb('perm-ow', o & 2); setCb('perm-ox', o & 1);

    const octInput = document.getElementById('chmod-octal-val');
    if (octInput && octInput.value !== octalStr) octInput.value = '0' + digits;
}

function calcPerms() {
    const getVal = (r, w, x) => {
        let n = 0;
        if (document.getElementById(r)?.checked) n += 4;
        if (document.getElementById(w)?.checked) n += 2;
        if (document.getElementById(x)?.checked) n += 1;
        return n;
    };
    const u = getVal('perm-ur', 'perm-uw', 'perm-ux');
    const g = getVal('perm-gr', 'perm-gw', 'perm-gx');
    const o = getVal('perm-or', 'perm-ow', 'perm-ox');
    const octal = `0${u}${g}${o}`;
    const octInput = document.getElementById('chmod-octal-val');
    if (octInput) octInput.value = octal;
}

async function submitChmod() {
    const targetPath = document.getElementById('chmod-target-path').value;
    const mode = document.getElementById('chmod-octal-val').value.trim();

    const res = await fetch('/api/file/chmod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ targetPath, mode })
    });
    const data = await res.json();
    if (data.success) {
        closeModal('modal-chmod-file');
        showNotification(data.message);
        loadFiles(currentPath);
    } else {
        alert('Permission error: ' + data.error);
    }
}

// 7. Compress to ZIP
function openCompressModal() {
    const count = selectedItems.size;
    if (!count) return;

    document.getElementById('compress-items-count').innerText = `${count} item(s) selected`;
    const firstIdx = selectedItems.values().next().value;
    const firstItem = currentFileList[firstIdx];
    const defaultName = (count === 1 ? firstItem.name.replace(/\.[^/.]+$/, '') : 'archive') + '.zip';
    document.getElementById('compress-zip-name').value = defaultName;

    const modal = document.getElementById('modal-compress-file');
    if (modal) modal.style.display = 'flex';
}

async function submitCompress() {
    const zipName = document.getElementById('compress-zip-name').value.trim();
    if (!zipName) return;

    const items = Array.from(selectedItems).map(i => currentFileList[i].path.replace(/\\/g, '/'));
    showNotification(`Compressing ${items.length} items to ${zipName}...`);

    const res = await fetch('/api/file/compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ items, zipName, targetDir: currentPath })
    });
    const data = await res.json();
    if (data.success) {
        closeModal('modal-compress-file');
        showNotification(`Created archive ${zipName}!`);
        loadFiles(currentPath);
    } else {
        alert('Compression error: ' + (data.output || data.error));
    }
}

// 8. Extract ZIP
async function extractSelectedZip() {
    const firstIdx = selectedItems.values().next().value;
    const item = currentFileList[firstIdx];
    if (!item) return;

    if (!confirm(`Extract archive ${item.name} to current directory?`)) return;
    showNotification(`Extracting ${item.name}...`);

    const res = await fetch('/api/file/unzip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ zipPath: item.path.replace(/\\/g, '/'), destDir: currentPath })
    });
    const data = await res.json();
    if (data.success) {
        showNotification('Archive extracted successfully!');
        loadFiles(currentPath);
    } else {
        alert('Extract error: ' + (data.output || data.error));
    }
}

// 9. Download File
function downloadSelectedFile() {
    const firstIdx = selectedItems.values().next().value;
    const item = currentFileList[firstIdx];
    if (!item || item.isDir) return;

    const cleanPath = item.path.replace(/\\/g, '/');
    const downloadUrl = `/api/file/download?path=${encodeURIComponent(cleanPath)}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// 10. Delete Selected Items
async function deleteSelected() {
    const count = selectedItems.size;
    if (!count) return;

    const names = Array.from(selectedItems).map(i => currentFileList[i].name).join(', ');
    if (!confirm(`Are you sure you want to permanently delete (${count}) item(s)?\n\n${names}`)) return;

    for (const idx of selectedItems) {
        const item = currentFileList[idx];
        if (item) {
            await fetch('/api/file/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                body: JSON.stringify({ targetPath: item.path.replace(/\\/g, '/') })
            });
        }
    }
    showNotification(`Deleted ${count} item(s)`);
    loadFiles(currentPath);
}

// 11. Edit Selected File
function editSelectedFile() {
    const firstIdx = selectedItems.values().next().value;
    const item = currentFileList[firstIdx];
    if (!item || item.isDir) return;
    editFileByPath(item.path.replace(/\\/g, '/'), item.name);
}

async function editFileByPath(filePath, fileName) {
    try {
        const res = await fetch('/api/file/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ filePath })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('editor-file-title').innerText = `Edit: ${fileName || filePath}`;
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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ filePath, content })
    });
    const data = await res.json();
    if (data.success) {
        closeModal('modal-edit-file');
        showNotification(`File saved successfully!`);
        loadFiles(currentPath);
    } else {
        alert('Save error: ' + data.error);
    }
}

// 12. Quick View Preview
async function viewSelectedFile() {
    const firstIdx = selectedItems.values().next().value;
    const item = currentFileList[firstIdx];
    if (!item || item.isDir) return;

    try {
        const res = await fetch('/api/file/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ filePath: item.path.replace(/\\/g, '/') })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('view-file-title').innerText = `Preview: ${item.name}`;
            document.getElementById('view-content-area').innerText = data.content;
            const modal = document.getElementById('modal-view-file');
            if (modal) modal.style.display = 'flex';
        } else {
            alert('Cannot preview: ' + data.error);
        }
    } catch (e) {
        alert('Preview error: ' + e.message);
    }
}

// 13. Upload File Modal & Action
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
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
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

// Toast Notification
function showNotification(msg) {
    try {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #1e293b;
            color: #fff;
            border: 1px solid var(--accent-primary, #6366f1);
            padding: 12px 20px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            z-index: 99999;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: fadeIn 0.3s ease;
        `;
        toast.innerHTML = `<i class="fa-solid fa-circle-check text-success" style="color:#10b981;"></i> ${msg}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    } catch (e) {
        console.log('Notification:', msg);
    }
}

