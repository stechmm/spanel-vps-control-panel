/**
 * NovaPanel - VPS Control Panel Main App Logic
 */

// Initial State Data
const state = {
    sites: JSON.parse(localStorage.getItem('novapanel_sites')) || [
        { domain: 'pandora-pos (Default)', type: 'Node.js App Server', php: 'Node 20.20', root: 'Proxy Port 4173', ssl: false, status: 'Active' }
    ],
    databases: JSON.parse(localStorage.getItem('novapanel_dbs')) || [],
    services: [
        { name: 'Nginx Web Server', service: 'nginx', status: 'running', port: '80' },
        { name: 'Node.js Engine (Pandora POS)', service: 'node (PID 770251)', status: 'running', port: '4173' },
        { name: 'Docker Engine', service: 'docker', status: 'installed', port: 'unix:///var/run/docker.sock' }
    ]
};

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    renderSites();
    renderDatabases();
    renderServices();
    initFileManager();
});

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

// Render Websites Table
function renderSites() {
    const tbody = document.getElementById('sites-table-body');
    if (!tbody) return;

    tbody.innerHTML = state.sites.map((site, index) => `
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
            <td><span class="tag">${site.php}</span></td>
            <td><code>${site.root}</code></td>
            <td><span class="badge-ssl"><i class="fa-solid fa-lock"></i> ${site.ssl ? "SSL Active" : "No SSL"}</span></td>
            <td><span class="status-badge active"><i class="fa-solid fa-check"></i> ${site.status}</span></td>
            <td>
                <button class="btn-icon-sm" title="Delete Site" onclick="deleteSite(${index})"><i class="fa-solid fa-trash text-danger"></i></button>
                <button class="btn-icon-sm text-primary" title="Open Site" onclick="window.open('https://${site.domain}', '_blank')"><i class="fa-solid fa-external-link"></i></button>
            </td>
        </tr>
    `).join('');
}

// Modal Handlers for Site Creation
function openAddSiteModal() {
    document.getElementById('modal-add-site').style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function submitCreateSite() {
    const domainInput = document.getElementById('new-domain-input').value.trim();
    const phpVal = document.getElementById('new-domain-php').value;

    if (!domainInput) {
        alert('Please enter a valid domain name!');
        return;
    }

    state.sites.push({
        domain: domainInput,
        type: 'PHP App',
        php: `PHP ${phpVal}`,
        root: `/var/www/${domainInput}`,
        ssl: true,
        status: 'Active'
    });

    localStorage.setItem('novapanel_sites', JSON.stringify(state.sites));
    renderSites();
    closeModal('modal-add-site');
    showNotification(`Website ${domainInput} created successfully with SSL certificate!`);
}

function deleteSite(index) {
    if (confirm(`Are you sure you want to remove site ${state.sites[index].domain}?`)) {
        const removed = state.sites.splice(index, 1);
        localStorage.setItem('novapanel_sites', JSON.stringify(state.sites));
        renderSites();
        showNotification(`Removed site ${removed[0].domain}`);
    }
}

// Render Databases Table
function renderDatabases() {
    const tbody = document.getElementById('db-table-body');
    if (!tbody) return;

    tbody.innerHTML = state.databases.map((db, idx) => `
        <tr>
            <td><i class="fa-solid fa-database blue-icon"></i> <strong>${db.name}</strong></td>
            <td><code>${db.user}</code></td>
            <td>${db.host}</td>
            <td>${db.size}</td>
            <td>
                <button class="btn-icon-sm text-primary" title="Export Dump" onclick="exportDb('${db.name}')"><i class="fa-solid fa-download"></i></button>
                <button class="btn-icon-sm" title="Delete DB" onclick="deleteDb(${idx})"><i class="fa-solid fa-trash text-danger"></i></button>
            </td>
        </tr>
    `).join('');
}

function openAddDbModal() {
    const dbName = prompt('Enter new database name (e.g. app_production_db):');
    if (dbName) {
        state.databases.push({
            name: dbName,
            user: dbName + '_usr',
            host: '127.0.0.1',
            size: '0 KB'
        });
        localStorage.setItem('novapanel_dbs', JSON.stringify(state.databases));
        renderDatabases();
        showNotification(`Database ${dbName} created!`);
    }
}

function deleteDb(idx) {
    if (confirm(`Delete database ${state.databases[idx].name}?`)) {
        state.databases.splice(idx, 1);
        localStorage.setItem('novapanel_dbs', JSON.stringify(state.databases));
        renderDatabases();
    }
}

function exportDb(name) {
    showNotification(`Exporting SQL dump file for database ${name}...`);
}

// Render System Services Grid
function renderServices() {
    const container = document.getElementById('services-grid');
    if (!container) return;

    container.innerHTML = state.services.map((svc, i) => `
        <div class="card">
            <div class="card-header">
                <h3><i class="fa-solid fa-server"></i> ${svc.name}</h3>
                <span class="status-badge active"><i class="fa-solid fa-check"></i> ${svc.status}</span>
            </div>
            <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Service daemon: <code>${svc.service}</code> • Port: ${svc.port}</p>
            <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary btn-sm" onclick="restartService('${svc.service}')"><i class="fa-solid fa-arrows-rotate"></i> Restart</button>
                <button class="btn btn-outline-danger btn-sm" onclick="toggleService(${i})"><i class="fa-solid fa-power-off"></i> Stop</button>
            </div>
        </div>
    `).join('');
}

function restartService(serviceName) {
    showNotification(`Restarting daemon ${serviceName}... Done!`);
}

function toggleService(index) {
    showNotification(`Service ${state.services[index].service} state updated.`);
}

// Simple File Manager Mock
function initFileManager() {
    const tbody = document.getElementById('fm-file-list');
    if (!tbody) return;

    const dummyFiles = [
        { name: 'public_html', isDir: true, size: '--', perm: '755', mtime: 'Aug 10 14:20' },
        { name: 'wp-config.php', isDir: false, size: '3.4 KB', perm: '644', mtime: 'Aug 09 18:11' },
        { name: '.htaccess', isDir: false, size: '512 B', perm: '644', mtime: 'Aug 01 09:30' },
        { name: 'index.php', isDir: false, size: '1.2 KB', perm: '644', mtime: 'Aug 10 12:00' },
        { name: 'uploads', isDir: true, size: '--', perm: '775', mtime: 'Aug 08 20:45' }
    ];

    tbody.innerHTML = dummyFiles.map(f => `
        <tr>
            <td><input type="checkbox"></td>
            <td>
                <i class="${f.isDir ? 'fa-solid fa-folder text-warning' : 'fa-solid fa-file-code text-primary'}"></i>
                <strong style="margin-left:8px; cursor:pointer;">${f.name}</strong>
            </td>
            <td>${f.size}</td>
            <td><code>${f.perm}</code></td>
            <td>${f.mtime}</td>
            <td>
                <button class="btn-icon-sm" title="Edit File"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="btn-icon-sm" title="Delete"><i class="fa-solid fa-trash text-danger"></i></button>
            </td>
        </tr>
    `).join('');
}

// 1-Click App Installer
function installApp(appName) {
    showNotification(`Starting 1-Click Installation of ${appName}... Please wait 15 seconds.`);
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
