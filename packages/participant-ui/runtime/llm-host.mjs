/**
 * llm-host.mjs — WebLLM integration
 *
 * Loads the local LLM via @mlc-ai/web-llm from CDN.
 * Exposes generateCompletion(prompt) → string.
 * System prompt comes from window.__mowai_config__.systemPrompt (persona body).
 */

const WEB_LLM_CDN = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm';

let engine = null;
let systemPrompt = '';

/**
 * Initialise the WebLLM engine.
 *
 * @param {string} modelId
 * @param {string} personaSystemPrompt  SKILL.md body, pre-stripped of frontmatter
 * @param {(progress: number, text: string) => void} onProgress
 * @returns {Promise<void>}
 */
export async function initialiseEngine(modelId, personaSystemPrompt, onProgress) {
  systemPrompt = personaSystemPrompt;

  let webllm;
  try {
    webllm = await import(`${WEB_LLM_CDN}`);
  } catch (err) {
    document.dispatchEvent(new CustomEvent('llm-error', {
      detail: { reason: `Failed to load WebLLM from CDN: ${err.message}` },
    }));
    return;
  }

  if (!navigator.gpu) {
    document.dispatchEvent(new CustomEvent('llm-error', {
      detail: { reason: 'WebGPU not available in this browser' },
    }));
    return;
  }

  try {
    engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: ({ progress, text }) => {
        const pct = Math.round(progress * 100);
        onProgress?.(pct, text);
        document.dispatchEvent(new CustomEvent('llm-progress', {
          detail: { progress: pct, text },
        }));
      },
    });
  } catch (err) {
    document.dispatchEvent(new CustomEvent('llm-error', {
      detail: { reason: err.message },
    }));
  }
}

/**
 * Generate a completion using the loaded engine.
 *
 * @param {string} userPrompt
 * @returns {Promise<string>}
 */
export async function generateCompletion(userPrompt) {
  if (!engine) throw new Error('LLM engine not initialised');

  const reply = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    temperature: 0.8,
    max_tokens: 256,
  });

  return reply.choices[0]?.message?.content ?? '';
}
