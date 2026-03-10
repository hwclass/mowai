/**
 * <mowai-console> — scrolling agent output log, max 200 entries, auto-scroll.
 *
 * Methods:
 *   appendEntry({ type, content, ts? })  type: 'thought' | 'response' | 'log'
 *   clear()
 */

const MAX_ENTRIES = 200;

class MowaiConsole extends HTMLElement {
  #entries = [];
  #autoScroll = true;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; flex-direction: column; overflow: hidden; background: #0a0a0a; }
        #feed {
          flex: 1; overflow-y: auto; padding: 8px 12px;
          font-family: monospace; font-size: 12px; color: #ccc;
          scroll-behavior: smooth;
        }
        #feed::-webkit-scrollbar { width: 4px; }
        #feed::-webkit-scrollbar-thumb { background: #333; }
        .entry { margin-bottom: 6px; border-left: 2px solid #333; padding-left: 8px; }
        .entry.thought { border-color: #f59e0b; }
        .entry.response { border-color: #22c55e; }
        .entry.log { border-color: #3b82f6; opacity: 0.7; }
        .meta { font-size: 10px; color: #555; margin-bottom: 2px; }
        .content { white-space: pre-wrap; word-break: break-word; }
        .type-badge {
          display: inline-block; font-size: 9px; padding: 1px 4px;
          border-radius: 2px; margin-right: 4px; vertical-align: middle;
        }
        .type-badge.thought { background: #451a03; color: #fbbf24; }
        .type-badge.response { background: #14532d; color: #4ade80; }
        .type-badge.log { background: #1e3a5f; color: #60a5fa; }
      </style>
      <div id="feed"></div>
    `;

    const feed = this.shadowRoot.getElementById('feed');
    feed.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = feed;
      this.#autoScroll = scrollHeight - scrollTop - clientHeight < 30;
    });
  }

  /**
   * @param {{ type: 'thought'|'response'|'log', content: string, ts?: number }} entry
   */
  appendEntry({ type, content, ts }) {
    this.#entries.push({ type, content, ts: ts ?? Date.now() });
    if (this.#entries.length > MAX_ENTRIES) this.#entries.shift();

    const feed = this.shadowRoot.getElementById('feed');
    const el = document.createElement('div');
    el.className = `entry ${type}`;

    const meta = document.createElement('div');
    meta.className = 'meta';
    const badge = document.createElement('span');
    badge.className = `type-badge ${type}`;
    badge.textContent = type.toUpperCase();
    meta.appendChild(badge);
    const time = document.createElement('span');
    time.textContent = new Date(this.#entries.at(-1).ts).toLocaleTimeString();
    meta.appendChild(time);
    el.appendChild(meta);

    const contentEl = document.createElement('div');
    contentEl.className = 'content';
    contentEl.textContent = content; // textContent only — never innerHTML
    el.appendChild(contentEl);

    feed.appendChild(el);

    // Evict oldest DOM node if over cap
    while (feed.children.length > MAX_ENTRIES) {
      feed.removeChild(feed.firstChild);
    }

    if (this.#autoScroll) {
      feed.scrollTop = feed.scrollHeight;
    }
  }

  clear() {
    this.#entries = [];
    this.shadowRoot.getElementById('feed').textContent = '';
  }
}

customElements.define('mowai-console', MowaiConsole);
