/**
 * <mowai-task> — task input + submit, displays current global task.
 *
 * Dispatches CustomEvent('submit-task', { detail: { description } }) on submit.
 * Call setCurrentTask(description) to show the active global task.
 */

class MowaiTask extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; padding: 8px 12px; background: #111; border-top: 1px solid #222; }
        .current-task {
          font-size: 11px; color: #888; margin-bottom: 6px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .current-task span { color: #a855f7; font-family: monospace; }
        .input-row { display: flex; gap: 8px; }
        textarea {
          flex: 1; background: #1a1a1a; color: #ddd; border: 1px solid #333;
          border-radius: 4px; padding: 6px 8px; font-family: monospace; font-size: 12px;
          resize: none; height: 40px; outline: none;
        }
        textarea:focus { border-color: #a855f7; }
        button {
          background: #a855f7; color: #fff; border: none; border-radius: 4px;
          padding: 0 14px; cursor: pointer; font-size: 12px; font-weight: bold;
        }
        button:disabled { background: #444; cursor: not-allowed; }
        button:hover:not(:disabled) { background: #9333ea; }
      </style>
      <div class="current-task" id="current-task"></div>
      <div class="input-row">
        <textarea id="input" placeholder="Enter a local task or wait for a global task…"></textarea>
        <button id="submit" disabled>Run</button>
      </div>
    `;

    const input = this.shadowRoot.getElementById('input');
    const btn = this.shadowRoot.getElementById('submit');

    input.addEventListener('input', () => {
      btn.disabled = !input.value.trim();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!btn.disabled) btn.click();
      }
    });

    btn.addEventListener('click', () => {
      const description = input.value.trim();
      if (!description) return;
      this.dispatchEvent(new CustomEvent('submit-task', { detail: { description }, bubbles: true }));
      input.value = '';
      btn.disabled = true;
    });
  }

  /** @param {string} description */
  setCurrentTask(description) {
    const el = this.shadowRoot.getElementById('current-task');
    el.textContent = '';
    if (description) {
      el.append('Active task: ');
      const span = document.createElement('span');
      span.textContent = description.slice(0, 80) + (description.length > 80 ? '…' : '');
      el.appendChild(span);
    }
  }

  setDisabled(disabled) {
    this.shadowRoot.getElementById('submit').disabled = disabled;
    this.shadowRoot.getElementById('input').disabled = disabled;
  }
}

customElements.define('mowai-task', MowaiTask);
