/**
 * <mowai-status> — LLM progress bar, WS badge, slot #, persona name.
 *
 * Attributes / observed:
 *   llm-progress  0–100
 *   ws-state      "connecting" | "connected" | "disconnected"
 *   slot          number
 *   persona       string
 *   llm-state     "loading" | "ready" | "error"
 */

class MowaiStatus extends HTMLElement {
  static observedAttributes = ['llm-progress', 'ws-state', 'slot', 'persona', 'llm-state'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: monospace; padding: 8px 12px; background: #111; color: #ddd; }
        .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .badge {
          font-size: 11px; padding: 2px 6px; border-radius: 3px;
          background: #222; color: #aaa; border: 1px solid #333;
        }
        .badge.connected { background: #14532d; color: #4ade80; border-color: #166534; }
        .badge.disconnected { background: #450a0a; color: #f87171; border-color: #7f1d1d; }
        .badge.connecting { background: #451a03; color: #fb923c; border-color: #7c2d12; }
        .progress-wrap { flex: 1; min-width: 120px; height: 4px; background: #333; border-radius: 2px; }
        .progress-bar { height: 100%; background: #a855f7; border-radius: 2px; transition: width 0.3s; }
        .label { font-size: 12px; color: #888; }
      </style>
      <div class="row">
        <span class="badge" id="ws-badge">WS: —</span>
        <span class="label" id="slot-label"></span>
        <span class="label" id="persona-label"></span>
        <span class="label" id="llm-label">LLM: loading…</span>
        <div class="progress-wrap" id="progress-wrap">
          <div class="progress-bar" id="progress-bar" style="width:0%"></div>
        </div>
      </div>
    `;
  }

  attributeChangedCallback(name, _old, value) {
    const sr = this.shadowRoot;
    if (name === 'ws-state') {
      const badge = sr.getElementById('ws-badge');
      badge.textContent = `WS: ${value}`;
      badge.className = `badge ${value}`;
    }
    if (name === 'slot') {
      sr.getElementById('slot-label').textContent = value ? `slot #${value}` : '';
    }
    if (name === 'persona') {
      sr.getElementById('persona-label').textContent = value ? `[${value}]` : '';
    }
    if (name === 'llm-progress') {
      const pct = Number(value);
      sr.getElementById('progress-bar').style.width = `${pct}%`;
      if (pct < 100) {
        sr.getElementById('llm-label').textContent = `LLM: ${pct}%`;
      }
    }
    if (name === 'llm-state') {
      const label = sr.getElementById('llm-label');
      if (value === 'ready') {
        label.textContent = 'LLM: ready';
        label.style.color = '#4ade80';
        sr.getElementById('progress-wrap').style.display = 'none';
      } else if (value === 'error') {
        label.textContent = 'LLM: error';
        label.style.color = '#f87171';
      }
    }
  }
}

customElements.define('mowai-status', MowaiStatus);
