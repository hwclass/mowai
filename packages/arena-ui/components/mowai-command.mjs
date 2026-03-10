/**
 * <mowai-command> — admin panel (shown only with ?admin=1 URL param).
 *
 * Sends POST /task to arena server.
 * Requires server URL from data attribute: data-arena-http="http://..."
 */

class MowaiCommand extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; background: #0f0f1a; border: 1px solid #a855f7; border-radius: 6px; padding: 12px; margin: 8px; }
        h3 { font-size: 12px; color: #a855f7; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; }
        .row { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px; }
        textarea {
          flex: 1; background: #1a1a1a; color: #ddd; border: 1px solid #333;
          border-radius: 4px; padding: 6px 8px; font-size: 12px; font-family: monospace;
          resize: vertical; min-height: 48px; outline: none;
        }
        textarea:focus { border-color: #a855f7; }
        button {
          background: #a855f7; color: #fff; border: none; border-radius: 4px;
          padding: 6px 12px; cursor: pointer; font-size: 12px; white-space: nowrap;
        }
        button:hover { background: #9333ea; }
        .status { font-size: 11px; color: #666; }
        .status.ok { color: #4ade80; }
        .status.err { color: #f87171; }
        .count { font-size: 12px; color: #888; margin-bottom: 8px; }
      </style>
      <h3>Admin</h3>
      <div class="count" id="count">0 agents connected</div>
      <div class="row">
        <textarea id="task-input" placeholder="Task description…"></textarea>
        <button id="broadcast-btn">Broadcast Task</button>
      </div>
      <div class="status" id="status"></div>
    `;

    this.shadowRoot.getElementById('broadcast-btn').addEventListener('click', () => this.#broadcastTask());
  }

  setAgentCount(n) {
    this.shadowRoot.getElementById('count').textContent = `${n} agent${n !== 1 ? 's' : ''} connected`;
  }

  async #broadcastTask() {
    const input = this.shadowRoot.getElementById('task-input');
    const status = this.shadowRoot.getElementById('status');
    const description = input.value.trim();
    if (!description) return;

    const arenaHttp = this.dataset.arenaHttp ?? '';
    const adminSecret = this.dataset.adminSecret ?? '';

    status.textContent = 'Broadcasting…';
    status.className = 'status';

    try {
      const res = await fetch(`${arenaHttp}/task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
        body: JSON.stringify({ description }),
      });
      const json = await res.json();
      if (res.ok) {
        status.textContent = `✓ Broadcast sent (taskId: ${json.taskId?.slice(0, 8)}…)`;
        status.className = 'status ok';
        input.value = '';
      } else {
        status.textContent = `Error: ${json.error ?? res.statusText}`;
        status.className = 'status err';
      }
    } catch (err) {
      status.textContent = `Network error: ${err.message}`;
      status.className = 'status err';
    }
  }
}

customElements.define('mowai-command', MowaiCommand);
