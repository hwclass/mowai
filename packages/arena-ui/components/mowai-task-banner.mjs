/**
 * <mowai-task-banner> — pinned banner showing current global task.
 *
 * Methods:
 *   setTask(description)
 *   clearTask()
 */

class MowaiTaskBanner extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; background: #1a1a2e; border-bottom: 2px solid #a855f7; padding: 8px 16px; }
        :host([hidden]) { display: none; }
        .label { font-size: 10px; color: #a855f7; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 3px; }
        .desc { font-size: 13px; color: #ddd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      </style>
      <div class="label">Active Task</div>
      <div class="desc" id="desc"></div>
    `;
  }

  setTask(description) {
    this.shadowRoot.getElementById('desc').textContent = description; // textContent only
    this.removeAttribute('hidden');
  }

  clearTask() {
    this.setAttribute('hidden', '');
    this.shadowRoot.getElementById('desc').textContent = '';
  }
}

customElements.define('mowai-task-banner', MowaiTaskBanner);
