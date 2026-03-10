/**
 * <mowai-roster> — sidebar: connected agents list with colour dots, persona tags.
 *
 * Methods:
 *   agentConnected({ agentId, name, color, persona, slot })
 *   agentDisconnected(agentId)
 *   pulseDot(agentId)   — briefly animates dot when agent posts
 */

class MowaiRoster extends HTMLElement {
  #agents = new Map(); // agentId → { el, dotEl }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; flex-direction: column; overflow: hidden; }
        .header { padding: 8px 12px; font-size: 11px; color: #555; border-bottom: 1px solid #1a1a1a; }
        #list { flex: 1; overflow-y: auto; padding: 4px 0; }
        #list::-webkit-scrollbar { width: 4px; }
        .agent { display: flex; align-items: center; gap: 6px; padding: 4px 12px; font-size: 12px; }
        .agent:hover { background: #111; }
        .dot {
          width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
          background: var(--color, #888);
        }
        .dot.pulse { animation: pulse 0.4s ease-out; }
        @keyframes pulse {
          0%   { transform: scale(1);   opacity: 1; }
          50%  { transform: scale(1.8); opacity: 0.8; }
          100% { transform: scale(1);   opacity: 1; }
        }
        .name { color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 110px; }
        .persona { font-size: 10px; color: #555; margin-left: auto; }
      </style>
      <div class="header" id="header">AGENTS (0)</div>
      <div id="list"></div>
    `;
  }

  agentConnected({ agentId, name, color, persona }) {
    if (this.#agents.has(agentId)) return;

    const el = document.createElement('div');
    el.className = 'agent';
    el.style.setProperty('--color', color);

    const dot = document.createElement('div');
    dot.className = 'dot';

    const nameEl = document.createElement('span');
    nameEl.className = 'name';
    nameEl.textContent = name; // textContent only

    const personaEl = document.createElement('span');
    personaEl.className = 'persona';
    personaEl.textContent = persona;

    el.appendChild(dot);
    el.appendChild(nameEl);
    el.appendChild(personaEl);

    this.shadowRoot.getElementById('list').appendChild(el);
    this.#agents.set(agentId, { el, dotEl: dot });
    this.#updateHeader();
  }

  agentDisconnected(agentId) {
    const entry = this.#agents.get(agentId);
    if (entry) {
      entry.el.remove();
      this.#agents.delete(agentId);
      this.#updateHeader();
    }
  }

  pulseDot(agentId) {
    const entry = this.#agents.get(agentId);
    if (!entry) return;
    const dot = entry.dotEl;
    dot.classList.remove('pulse');
    // Force reflow so animation restarts
    void dot.offsetWidth;
    dot.classList.add('pulse');
    dot.addEventListener('animationend', () => dot.classList.remove('pulse'), { once: true });
  }

  #updateHeader() {
    this.shadowRoot.getElementById('header').textContent = `AGENTS (${this.#agents.size})`;
  }
}

customElements.define('mowai-roster', MowaiRoster);
