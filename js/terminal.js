/**
 * Interactive SSH Web Terminal Simulator
 */

document.addEventListener('DOMContentLoaded', () => {
    initTerminal();
});

function initTerminal() {
    const input = document.getElementById('term-input');
    const body = document.getElementById('terminal-body');
    const clearBtn = document.getElementById('clear-term');

    if (!input || !body) return;

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            body.querySelectorAll('.term-line').forEach(el => el.remove());
        });
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const cmd = input.value.trim();
            if (cmd === '') return;

            // Output command prompt line
            appendTerminalLine(`root@167.172.79.75:~# ${cmd}`, 'prompt');
            input.value = '';

            // Execute command logic
            processCommand(cmd);
            body.scrollTop = body.scrollHeight;
        }
    });
}

function appendTerminalLine(text, type = 'output') {
    const body = document.getElementById('terminal-body');
    const line = document.createElement('div');
    line.className = `term-line ${type}`;

    if (type === 'prompt') {
        line.style.color = '#818cf8';
        line.style.fontWeight = '600';
    }

    line.textContent = text;
    body.insertBefore(line, body.querySelector('.term-prompt-line'));
}

function processCommand(cmd) {
    const lower = cmd.toLowerCase();

    if (lower === 'help') {
        appendTerminalLine('Available VPS Management Commands:');
        appendTerminalLine('  status         - Show overall system health & resource summary');
        appendTerminalLine('  df -h          - Check disk space usage');
        appendTerminalLine('  free -m        - Check RAM memory consumption');
        appendTerminalLine('  docker ps      - List running Docker containers');
        appendTerminalLine('  nginx -t       - Test Nginx server configuration syntax');
        appendTerminalLine('  ufw status     - Display firewall rules');
        appendTerminalLine('  systemctl status - Show active services');
        appendTerminalLine('  clear          - Clear terminal screen');
        appendTerminalLine('  reboot         - Send reboot signal to droplet');
    } else if (lower === 'status' || lower === 'htop') {
        appendTerminalLine('=== SYSTEM STATUS ===');
        appendTerminalLine('OS: Ubuntu 24.04 LTS (x86_64)');
        appendTerminalLine('CPU Load: 0.18, 0.22, 0.15 (18% active)');
        appendTerminalLine('Memory: 1420MB / 4096MB (35.5% used)');
        appendTerminalLine('Disk: 22.4GB / 80GB (28% used)');
        appendTerminalLine('Uptime: 14 days, 6 hours');
    } else if (lower === 'df -h') {
        appendTerminalLine('Filesystem      Size  Used Avail Use% Mounted on');
        appendTerminalLine('/dev/vda1        78G   23G   55G  30% /');
        appendTerminalLine('tmpfs           2.0G  1.2M  2.0G   1% /run');
    } else if (lower === 'free -m') {
        appendTerminalLine('               total        used        free      shared  buff/cache   available');
        appendTerminalLine('Mem:            3950        1420        1850          12        browser        2400');
        appendTerminalLine('Swap:           2048           0        2048');
    } else if (lower === 'docker ps') {
        appendTerminalLine('CONTAINER ID   IMAGE          COMMAND                  CREATED        STATUS        PORTS');
        appendTerminalLine('8f9a2b1c0d3e   redis:alpine   "docker-entrypoint.s…"   3 days ago     Up 3 days     0.0.0.0:6379->6379/tcp');
    } else if (lower === 'nginx -t') {
        appendTerminalLine('nginx: the configuration file /etc/nginx/nginx.conf syntax is ok');
        appendTerminalLine('nginx: configuration file /etc/nginx/nginx.conf test is successful');
    } else if (lower === 'ufw status') {
        appendTerminalLine('Status: active');
        appendTerminalLine('To                         Action      From');
        appendTerminalLine('--                         ------      ----');
        appendTerminalLine('22/tcp                     ALLOW       Anywhere');
        appendTerminalLine('80/tcp                     ALLOW       Anywhere');
        appendTerminalLine('443/tcp                    ALLOW       Anywhere');
    } else if (lower === 'clear') {
        document.querySelectorAll('.term-line').forEach(el => el.remove());
    } else if (lower === 'reboot') {
        appendTerminalLine('[NOTICE] System reboot initiated via DigitalOcean API...', 'output');
    } else {
        appendTerminalLine(`bash: ${cmd}: command executed successfully (simulated response).`);
    }
}
