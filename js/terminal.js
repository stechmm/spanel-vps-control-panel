/**
 * Interactive SSH Web Terminal Console with Stateful CWD Tracking
 */

let terminalCwd = '/var/www';

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

            appendTerminalLine(`root@104.207.92.237:${terminalCwd}# ${cmd}`, 'prompt');
            input.value = '';

            if (cmd.toLowerCase() === 'clear') {
                document.querySelectorAll('.term-line').forEach(el => el.remove());
                return;
            }

            const token = localStorage.getItem('spanel_token') || '';

            // Send command execution request with active CWD
            try {
                const res = await fetch('/api/terminal-exec', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ command: cmd, cwd: terminalCwd })
                });
                const data = await res.json();

                if (data.cwd) {
                    terminalCwd = data.cwd;
                    updatePromptLine(terminalCwd);
                }

                if (data.output) {
                    appendTerminalLine(data.output.trim(), 'output');
                } else if (cmd.startsWith('cd ')) {
                    appendTerminalLine(`(directory changed to ${terminalCwd})`, 'output');
                } else {
                    appendTerminalLine('(command completed cleanly)', 'output');
                }
            } catch (err) {
                appendTerminalLine(`Error executing command: ${err.message}`, 'output');
            }

            body.scrollTop = body.scrollHeight;
        }
    });
}

function updatePromptLine(cwd) {
    const promptText = document.querySelector('.prompt-text');
    if (promptText) {
        promptText.textContent = `root@104.207.92.237:${cwd}#`;
    }
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
