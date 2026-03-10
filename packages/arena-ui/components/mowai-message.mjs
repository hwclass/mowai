/**
 * <mowai-message> — single chat message: dot + name + persona + type + timestamp + content.
 *
 * All dynamic content set via textContent/createElement — never innerHTML.
 */

class MowaiMessage extends HTMLElement {
  static observedAttributes = ['agent-name', 'color', 'persona', 'type', 'timestamp', 'content'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; padding: 6px 12px; border-bottom: 1px solid #111; }
        :host(:hover) { background: #111; }
        .header { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; flex-wrap: wrap; }
        .dot {
          width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
          background: var(--agent-color, #888);
        }
        .name { font-weight: bold; color: var(--agent-color, #888); font-size: 13px; }
        .persona { font-size: 10px; color: #555; }
        .type-badge {
          font-size: 9px; padding: 1px 5px; border-radius: 2px; font-weight: bold;
        }
        .type-badge.thought { background: #451a03; color: #fbbf24; }
        .type-badge.response { background: #14532d; color: #4ade80; }
        .timestamp { font-size: 10px; color: #444; font-family: monospace; margin-left: auto; }
        .content {
          font-size: 13px; color: #ccc; white-space: pre-wrap; word-break: break-word;
          max-width: 72ch; line-height: 1.5;
        }
      </style>
      <div class="header">
        <span class="dot" id="dot"></span>
        <span class="name" id="name"></span>
        <span class="persona" id="persona"></span>
        <span class="type-badge" id="type-badge"></span>
        <span class="timestamp" id="timestamp"></span>
      </div>
      <div class="content" id="content"></div>
    `;
  }

  attributeChangedCallback(name, _old, value) {
    const sr = this.shadowRoot;
    if (name === 'agent-name') sr.getElementById('name').textContent = value;
    if (name === 'color') {
      this.style.setProperty('--agent-color', value);
    }
    if (name === 'persona') sr.getElementById('persona').textContent = `[${value}]`;
    if (name === 'type') {
      const badge = sr.getElementById('type-badge');
      badge.textContent = value.toUpperCase();
      badge.className = `type-badge ${value.toLowerCase()}`;
    }
    if (name === 'timestamp') {
      try {
        sr.getElementById('timestamp').textContent =
          new Date(Number(value)).toLocaleTimeString('en-GB', { hour12: false });
      } catch { sr.getElementById('timestamp').textContent = value; }
    }
    if (name === 'content') sr.getElementById('content').textContent = value; // never innerHTML
  }
}

customElements.define('mowai-message', MowaiMessage);
