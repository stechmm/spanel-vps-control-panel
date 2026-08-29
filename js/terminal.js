/**
 * Interactive SSH Web Terminal Console (Live VPS Command Execution)
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

    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const cmd = input.value.trim();
            if (cmd === '') return;

            appendTerminalLine(`root@167.172.79.75:~# ${cmd}`, 'prompt');
            input.value = '';

            if (cmd.toLowerCase() === 'clear') {
                document.querySelectorAll('.term-line').forEach(el => el.remove());
                return;
            }

            // Send command execution request to backend API
            try {
                const res = await fetch('/api/terminal-exec', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: cmd })
                });
                const data = await res.json();
                if (data.output) {
                    appendTerminalLine(data.output.trim(), 'output');
                } else {
                    appendTerminalLine('(command completed with no output)', 'output');
                }
            } catch (err) {
                appendTerminalLine(`Error executing command: ${err.message}`, 'output');
            }

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
