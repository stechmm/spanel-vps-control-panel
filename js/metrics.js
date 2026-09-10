/**
 * Real-Time System Metrics Chart & Host Stats Engine
 * Directly polls /api/stats for live CPU, RAM, Disk, Hostname, and Uptime
 */

let systemChart = null;

document.addEventListener('DOMContentLoaded', () => {
    initMetricsChart();
    fetchLiveMetrics();
    setInterval(fetchLiveMetrics, 3000);
});

function initMetricsChart() {
    const ctx = document.getElementById('systemMetricsChart');
    if (!ctx) return;
    if (typeof Chart === 'undefined') return;

    const labels = [];
    const cpuData = [];
    const ramData = [];

    const now = new Date();
    for (let i = 9; i >= 0; i--) {
        const timeStr = new Date(now.getTime() - i * 3000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        labels.push(timeStr);
        cpuData.push(0);
        ramData.push(0);
    }

    systemChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'CPU Load (%)',
                    data: cpuData,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.15)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 3
                },
                {
                    label: 'RAM Usage (%)',
                    data: ramData,
                    borderColor: '#0ea5e9',
                    backgroundColor: 'rgba(14, 165, 233, 0.15)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    labels: { color: '#9ca3af', font: { family: 'Plus Jakarta Sans', size: 12 } }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#6b7280', font: { size: 11 } },
                    grid: { color: 'rgba(255, 255, 255, 0.04)' }
                },
                y: {
                    min: 0,
                    max: 100,
                    ticks: { color: '#6b7280', font: { size: 11 } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                }
            }
        }
    });
}

async function fetchLiveMetrics() {
    const token = localStorage.getItem('spanel_token') || '';
    if (!token) return;

    try {
        const res = await fetch('/api/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;

        const data = await res.json();
        if (!data || data.error) return;

        // 1. Update Chart Data
        if (systemChart) {
            const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            systemChart.data.labels.shift();
            systemChart.data.labels.push(timeNow);

            systemChart.data.datasets[0].data.shift();
            systemChart.data.datasets[0].data.push(data.cpuUsagePct || 0);

            systemChart.data.datasets[1].data.shift();
            systemChart.data.datasets[1].data.push(data.ramUsagePct || 0);

            systemChart.update();
        }

        // 2. Update CPU Card
        const cpuValEl = document.getElementById('cpu-usage-val');
        const cpuBarEl = document.getElementById('cpu-bar');
        const cpuModelSub = document.getElementById('cpu-model-sub');
        if (cpuValEl) cpuValEl.innerText = `${data.cpuUsagePct || 0}%`;
        if (cpuBarEl) cpuBarEl.style.width = `${Math.min(100, data.cpuUsagePct || 0)}%`;
        if (cpuModelSub) {
            cpuModelSub.innerText = `${data.cpuCores || 1} Core - ${data.cpuModel || 'CPU'} (Load: ${data.cpuLoadVal || '0.00'})`;
        }

        // 3. Update RAM Card
        const ramValEl = document.getElementById('ram-usage-val');
        const ramBarEl = document.getElementById('ram-bar');
        const swapSub = document.getElementById('swap-stat-sub');
        if (ramValEl) {
            ramValEl.innerText = `${data.usedRamMB || 0} MB / ${data.totalRamMB || 0} MB (${data.ramUsagePct || 0}%)`;
        }
        if (ramBarEl) ramBarEl.style.width = `${Math.min(100, data.ramUsagePct || 0)}%`;
        if (swapSub) {
            swapSub.innerHTML = `<i class="fa-solid fa-shield-halved text-success"></i> SWAP: ${data.swapUsed || '0B'} / ${data.swapTotal || '0B'}`;
        }

        // 4. Update Storage Card
        const diskValEl = document.getElementById('disk-usage-val');
        const diskBarEl = document.getElementById('disk-bar');
        const diskAvailSub = document.getElementById('disk-avail-sub');
        if (diskValEl) {
            diskValEl.innerText = `${data.diskUsed || '--'} / ${data.diskTotal || '--'} (${data.diskPct || 0}%)`;
        }
        if (diskBarEl) diskBarEl.style.width = `${Math.min(100, data.diskPct || 0)}%`;
        if (diskAvailSub) {
            diskAvailSub.innerText = `Available: ${data.diskAvail || '--'} Free`;
        }

        // 5. Update Server Uptime & Subtitle
        const uptimeEl = document.getElementById('server-uptime');
        if (uptimeEl) uptimeEl.innerText = data.uptime || '--';

        const subTitleEl = document.getElementById('dashboard-host-subtitle');
        if (subTitleEl && data.hostname) {
            subTitleEl.innerText = `Node: ${data.hostname} | Kernel: ${data.osDistro || 'Linux'} | IP: ${data.serverIp || 'Host'}`;
        }

        // 6. Update Sidebar Server Meta
        const currentServerName = document.getElementById('current-server-name');
        const serverIpVal = document.getElementById('server-ip-val');
        const serverOsVal = document.getElementById('server-os-val');
        if (currentServerName && data.hostname) currentServerName.innerText = data.hostname;
        if (serverIpVal && data.serverIp) serverIpVal.innerText = data.serverIp;
        if (serverOsVal && data.osDistro) serverOsVal.innerText = data.osDistro;

    } catch (e) {
        console.error('Metrics fetch error', e);
    }
}
