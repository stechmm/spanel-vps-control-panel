/**
 * Real-Time System Metrics Chart (Chart.js)
 */

document.addEventListener('DOMContentLoaded', () => {
    initMetricsChart();
});

function initMetricsChart() {
    const ctx = document.getElementById('systemMetricsChart');
    if (!ctx) return;

    const labels = [];
    const cpuData = [];
    const ramData = [];

    // Pre-populate last 10 data points
    const now = new Date();
    for (let i = 9; i >= 0; i--) {
        const timeStr = new Date(now.getTime() - i * 3000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        labels.push(timeStr);
        cpuData.push(Math.floor(Math.random() * 15) + 10); // 10% - 25%
        ramData.push(Math.floor(Math.random() * 8) + 32);  // 32% - 40%
    }

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'CPU Usage (%)',
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

    // Periodically update graph with live simulated metrics
    setInterval(() => {
        const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const newCpu = Math.floor(Math.random() * 20) + 12;
        const newRam = Math.floor(Math.random() * 5) + 34;

        chart.data.labels.shift();
        chart.data.labels.push(timeNow);

        chart.data.datasets[0].data.shift();
        chart.data.datasets[0].data.push(newCpu);

        chart.data.datasets[1].data.shift();
        chart.data.datasets[1].data.push(newRam);

        chart.update();

        // Update DOM numerical values
        const cpuValEl = document.getElementById('cpu-usage-val');
        const cpuBarEl = document.getElementById('cpu-bar');
        if (cpuValEl && cpuBarEl) {
            cpuValEl.innerText = `${newCpu}%`;
            cpuBarEl.style.width = `${newCpu}%`;
        }
    }, 3000);
}
