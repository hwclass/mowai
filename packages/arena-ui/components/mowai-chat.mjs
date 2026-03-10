/**
 * <mowai-chat> — main chat feed.
 *
 * - Batched DOM updates (16ms rAF batching)
 * - Max 500 rendered messages, oldest evicted
 * - Auto-scroll to bottom unless user has scrolled up
 *
 * Methods:
 *   addMessage({ agentName, color, persona, type, content, ts })
 *   clear()
 */

const MAX_MESSAGES = 500;
const BATCH_MS = 16;

class MowaiChat extends HTMLElement {
  #pending = [];
  #rafScheduled = false;
  #autoScroll = true;
  #messageCount = 0;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; flex-direction: column; overflow: hidden; }
        #feed { flex: 1; overflow-y: auto; }
        #feed::-webkit-scrollbar { width: 4px; }
        #feed::-webkit-scrollbar-thumb { background: #222; }
      </style>
      <div id="feed"></div>
    `;

    const feed = this.shadowRoot.getElementById('feed');
    feed.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = feed;
      this.#autoScroll = scrollHeight - scrollTop - clientHeight < 40;
    });
  }

  /**
   * @param {{ agentName: string, color: string, persona: string, type: string, content: string, ts: number }} msg
   */
  addMessage(msg) {
    this.#pending.push(msg);
    if (!this.#rafScheduled) {
      this.#rafScheduled = true;
      requestAnimationFrame(() => this.#flush());
    }
  }

  #flush() {
    this.#rafScheduled = false;
    if (this.#pending.length === 0) return;

    const feed = this.shadowRoot.getElementById('feed');
    const frag = document.createDocumentFragment();

    for (const msg of this.#pending.splice(0)) {
      const el = document.createElement('mowai-message');
      el.setAttribute('agent-name', msg.agentName);
      el.setAttribute('color', msg.color);
      el.setAttribute('persona', msg.persona);
      el.setAttribute('type', msg.type);
      el.setAttribute('timestamp', String(msg.ts));
      el.setAttribute('content', msg.content);
      frag.appendChild(el);
      this.#messageCount++;
    }

    feed.appendChild(frag);

    // Evict oldest
    while (this.#messageCount > MAX_MESSAGES) {
      if (feed.firstChild) {
        feed.removeChild(feed.firstChild);
        this.#messageCount--;
      } else break;
    }

    if (this.#autoScroll) {
      feed.scrollTop = feed.scrollHeight;
    }
  }

  clear() {
    this.#pending = [];
    this.#messageCount = 0;
    this.shadowRoot.getElementById('feed').textContent = '';
  }
}

customElements.define('mowai-chat', MowaiChat);
