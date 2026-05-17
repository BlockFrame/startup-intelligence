import { CHROME_UA } from './constants';
import { isProviderAvailable } from './llm-health';
import { sanitizeForPrompt } from './llm-sanitize.js';

export interface ProviderCredentials {
  apiUrl: string;
  model: string;
  headers: Record<string, string>;
  extraBody?: Record<string, unknown>;
  bodyFormat?: 'openai' | 'anthropic';
}

export type LlmProviderName =
  | 'ollama'
  | 'groq'
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'mistral'
  | 'huggingface'
  | 'generic';

export interface ProviderCredentialOverrides {
  model?: string;
}

const OPENROUTER_FREE_MODEL = 'openrouter/free';

function resolveOpenRouterModel(model?: string): string {
  const value = (model || '').trim();
  if (!value) return OPENROUTER_FREE_MODEL;
  if (value === OPENROUTER_FREE_MODEL || value.endsWith(':free')) return value;
  console.warn(`[llm] OpenRouter paid model "${value}" blocked; using ${OPENROUTER_FREE_MODEL}`);
  return OPENROUTER_FREE_MODEL;
}

const OLLAMA_HOST_ALLOWLIST = new Set([
  'localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal',
]);

function isLocalDeployment(): boolean {
  const mode = typeof process !== 'undefined' ? (process.env?.LOCAL_API_MODE || '') : '';
  return mode.includes('sidecar') || mode.includes('docker');
}

export function getProviderCredentials(
  provider: string,
  overrides: ProviderCredentialOverrides = {},
): ProviderCredentials | null {
  if (provider === 'ollama') {
    const baseUrl = process.env.OLLAMA_API_URL;
    if (!baseUrl) return null;

    if (!isLocalDeployment()) {
      try {
        const hostname = new URL(baseUrl).hostname;
        if (!OLLAMA_HOST_ALLOWLIST.has(hostname)) {
          console.warn(`[llm] Ollama blocked: hostname "${hostname}" not in allowlist`);
          return null;
        }
      } catch {
        return null;
      }
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = process.env.OLLAMA_API_KEY;
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    return {
      apiUrl: new URL('/v1/chat/completions', baseUrl).toString(),
      model: overrides.model || process.env.OLLAMA_MODEL || 'llama3.1:8b',
      headers,
      extraBody: { think: false },
    };
  }

  if (provider === 'groq') {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;
    return {
      apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
      model: overrides.model || process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    return {
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      model: overrides.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };
  }

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    return {
      apiUrl: 'https://api.anthropic.com/v1/messages',
      model: overrides.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      bodyFormat: 'anthropic',
    };
  }

  if (provider === 'mistral') {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) return null;
    return {
      apiUrl: 'https://api.mistral.ai/v1/chat/completions',
      model: overrides.model || process.env.MISTRAL_MODEL || 'mistral-small-latest',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };
  }

  if (provider === 'openrouter') {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return null;
    return {
      apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
      model: resolveOpenRouterModel(overrides.model || process.env.OPENROUTER_MODEL),
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://startupintelligence.app',
        'X-Title': 'Startup Intelligence',
      },
    };
  }

  if (provider === 'huggingface') {
    const apiKey = process.env.HUGGINGFACE_API_KEY || process.env.HUGGINGFACE_TOKEN;
    if (!apiKey) return null;
    return {
      apiUrl: 'https://router.huggingface.co/v1/chat/completions',
      model: overrides.model || process.env.HUGGINGFACE_MODEL || 'meta-llama/Llama-3.1-8B-Instruct',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };
  }

  // Generic OpenAI-compatible endpoint via LLM_API_URL/LLM_API_KEY/LLM_MODEL
  if (provider === 'generic') {
    const apiUrl = process.env.LLM_API_URL;
    const apiKey = process.env.LLM_API_KEY;
    if (!apiUrl || !apiKey) return null;
    return {
      apiUrl,
      model: overrides.model || process.env.LLM_MODEL || 'gpt-3.5-turbo',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };
  }

  return null;
}

export function stripThinkingTags(text: string): string {
  let s = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\|thinking\|>[\s\S]*?<\|\/thinking\|>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/<reflection>[\s\S]*?<\/reflection>/gi, '')
    .replace(/<\|begin_of_thought\|>[\s\S]*?<\|end_of_thought\|>/gi, '')
    .trim();

  // Strip unterminated opening tags (no closing tag present)
  s = s
    .replace(/<think>[\s\S]*/gi, '')
    .replace(/<\|thinking\|>[\s\S]*/gi, '')
    .replace(/<reasoning>[\s\S]*/gi, '')
    .replace(/<reflection>[\s\S]*/gi, '')
    .replace(/<\|begin_of_thought\|>[\s\S]*/gi, '')
    .trim();

  return s;
}


const PROVIDER_CHAIN = ['ollama', 'groq', 'openrouter', 'openai', 'anthropic', 'mistral', 'huggingface', 'generic'] as const;
const PROVIDER_SET = new Set<string>(PROVIDER_CHAIN);

export interface LlmCallOptions {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  provider?: string;
  // Optional overrides. When omitted, the historic provider chain and default
  // provider models remain unchanged for all existing callers.
  providerOrder?: string[];
  modelOverrides?: Partial<Record<LlmProviderName, string>>;
  stripThinkingTags?: boolean;
  validate?: (content: string) => boolean;
  /** Optional text to append to the system message (index 0). Appended as \n\n---\n\n<systemAppend>. No-op if no system message at index 0. */
  systemAppend?: string;
}

export interface LlmCallResult {
  content: string;
  model: string;
  provider: string;
  tokens: number;
}

function resolveProviderChain(opts: {
  forcedProvider?: string;
  providerOrder?: string[];
}): string[] {
  if (opts.forcedProvider) return [opts.forcedProvider];
  if (!Array.isArray(opts.providerOrder) || opts.providerOrder.length === 0) {
    return [...PROVIDER_CHAIN];
  }

  const seen = new Set<string>();
  const providers: string[] = [];
  for (const provider of opts.providerOrder) {
    if (!PROVIDER_SET.has(provider) || seen.has(provider)) continue;
    seen.add(provider);
    providers.push(provider);
  }

  return providers.length > 0 ? providers : [...PROVIDER_CHAIN];
}

function callLlmProfile(
  opts: Omit<LlmCallOptions, 'providerOrder' | 'modelOverrides'>,
  providerEnv: string,
  modelEnv: string,
  defaultProvider: LlmProviderName,
): Promise<LlmCallResult | null> {
  const envProvider = process.env[providerEnv];
  const provider = (envProvider && PROVIDER_SET.has(envProvider) ? envProvider : (() => {
    if (envProvider) console.warn(`[llm] ${providerEnv}="${envProvider}" is not a known provider; falling back to "${defaultProvider}"`);
    return defaultProvider;
  })()) as LlmProviderName;
  const rawModel = process.env[modelEnv];
  const model = provider === 'openrouter'
    ? resolveOpenRouterModel(rawModel || process.env.OPENROUTER_MODEL)
    : rawModel;
  const remaining = PROVIDER_CHAIN.filter((p) => p !== provider);
  return callLlm({
    ...opts,
    providerOrder: [provider, ...remaining],
    modelOverrides: model ? { [provider]: model } as Partial<Record<LlmProviderName, string>> : undefined,
  });
}

function splitSystemMessage(messages: Array<{ role: string; content: string }>): {
  system?: string;
  messages: Array<{ role: string; content: string }>;
} {
  const first = messages[0];
  if (first?.role !== 'system') return { messages };
  return { system: first.content, messages: messages.slice(1) };
}

export function buildLlmRequestBody(
  creds: ProviderCredentials,
  messages: Array<{ role: string; content: string }>,
  opts: { temperature: number; maxTokens: number; stream?: boolean; topP?: number },
): Record<string, unknown> {
  if (creds.bodyFormat === 'anthropic') {
    const split = splitSystemMessage(messages);
    return {
      model: creds.model,
      system: split.system,
      messages: split.messages.map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
      })),
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      top_p: opts.topP,
      stream: opts.stream,
    };
  }

  return {
    ...creds.extraBody,
    model: creds.model,
    messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    top_p: opts.topP,
    stream: opts.stream,
  };
}

export function extractLlmText(creds: ProviderCredentials, data: any): string {
  if (creds.bodyFormat === 'anthropic') {
    const parts = Array.isArray(data?.content) ? data.content : [];
    return parts
      .map((part: any) => typeof part?.text === 'string' ? part.text : '')
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return (typeof data?.choices?.[0]?.message?.content === 'string'
    ? data.choices[0].message.content
    : '').trim();
}

function extractLlmStreamDelta(creds: ProviderCredentials, chunk: any): string {
  if (creds.bodyFormat === 'anthropic') {
    return typeof chunk?.delta?.text === 'string' ? chunk.delta.text : '';
  }
  return typeof chunk?.choices?.[0]?.delta?.content === 'string' ? chunk.choices[0].delta.content : '';
}

/** Cheap/fast model for extraction and parsing tasks. Configurable via LLM_TOOL_PROVIDER / LLM_TOOL_MODEL. */
export const callLlmTool = (opts: Omit<LlmCallOptions, 'providerOrder' | 'modelOverrides'>) =>
  callLlmProfile(opts, 'LLM_TOOL_PROVIDER', 'LLM_TOOL_MODEL', 'groq');

/** Powerful model for synthesis and reasoning tasks. Configurable via LLM_REASONING_PROVIDER / LLM_REASONING_MODEL. */
export const callLlmReasoning = (opts: Omit<LlmCallOptions, 'providerOrder' | 'modelOverrides'>) =>
  callLlmProfile(opts, 'LLM_REASONING_PROVIDER', 'LLM_REASONING_MODEL', 'openrouter');

export type LlmStreamOptions = Omit<LlmCallOptions, 'stripThinkingTags' | 'validate' | 'providerOrder' | 'modelOverrides' | 'provider'> & {
  /** When fired, aborts the active provider fetch and stops the stream. */
  signal?: AbortSignal;
};

/**
 * Streaming variant of callLlmReasoning.
 * Returns a ReadableStream that emits SSE lines:
 *   data: {"delta":"..."}  — one per content chunk
 *   data: {"done":true}    — terminal event
 * Returns null if no provider is available.
 */
export function callLlmReasoningStream(opts: LlmStreamOptions): ReadableStream<Uint8Array> {
  const envProvider = process.env.LLM_REASONING_PROVIDER;
  const provider = (envProvider && PROVIDER_SET.has(envProvider) ? envProvider : 'openrouter') as LlmProviderName;
  const model = provider === 'openrouter'
    ? resolveOpenRouterModel(process.env.LLM_REASONING_MODEL || process.env.OPENROUTER_MODEL)
    : process.env.LLM_REASONING_MODEL;
  const remaining = PROVIDER_CHAIN.filter((p) => p !== provider);
  const providerOrder = [provider, ...remaining];
  const modelOverrides = model ? { [provider]: model } as Partial<Record<LlmProviderName, string>> : undefined;

  const {
    messages: rawMessages,
    temperature = 0.3,
    maxTokens = 600,
    timeoutMs = 90_000,
    systemAppend,
    signal: clientSignal,
  } = opts;

  let messages = rawMessages;
  const firstMsg = messages[0];
  if (systemAppend && firstMsg?.role === 'system') {
    const sanitized = sanitizeForPrompt(systemAppend);
    if (sanitized) {
      messages = [
        { role: 'system', content: `${firstMsg.content}\n\n---\n\n${sanitized}` },
        ...messages.slice(1),
      ];
    }
  }

  const enc = new TextEncoder();
  let activeController: AbortController | null = null;
  let streamClosed = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: Record<string, unknown>) => {
        if (streamClosed) return;
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      const closeStream = () => {
        if (streamClosed) return;
        streamClosed = true;
        controller.close();
      };

      for (const providerName of providerOrder) {
        if (streamClosed) break;

        const creds = getProviderCredentials(providerName, {
          model: modelOverrides?.[providerName as LlmProviderName],
        });
        if (!creds) continue;

        if (!(await isProviderAvailable(creds.apiUrl))) {
          console.warn(`[llm-stream:${providerName}] Offline, skipping`);
          continue;
        }

        // Per-fetch abort controller merges client signal + per-request timeout
        activeController = new AbortController();
        const timeoutId = setTimeout(() => activeController?.abort(), timeoutMs);
        if (clientSignal?.aborted) { clearTimeout(timeoutId); break; }
        clientSignal?.addEventListener('abort', () => activeController?.abort(), { once: true });

        let hasContent = false;
        try {
          const resp = await fetch(creds.apiUrl, {
            method: 'POST',
            headers: { ...creds.headers, 'User-Agent': CHROME_UA },
            body: JSON.stringify(buildLlmRequestBody(creds, messages, { temperature, maxTokens, stream: true })),
            signal: activeController.signal,
          });
          // Timeout stays active — it must bound the streaming body read, not just the connection

          if (!resp.ok || !resp.body) {
            clearTimeout(timeoutId);
            const errBody = resp.body ? await resp.text().catch(() => '') : '';
            console.warn(`[llm-stream:${providerName}] HTTP ${resp.status} model=${creds.model} body=${errBody.slice(0, 300)}`);
            continue;
          }

          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          let providerDone = false;

          while (!streamClosed && !providerDone) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const payload = line.slice(6).trim();
              if (payload === '[DONE]') { providerDone = true; break; }
              try {
                const chunk = JSON.parse(payload);
                const delta = extractLlmStreamDelta(creds, chunk);
                if (delta) {
                  hasContent = true;
                  emit({ delta });
                }
              } catch { /* malformed chunk — skip */ }
            }
          }
          clearTimeout(timeoutId);

          if (hasContent) {
            emit({ done: true });
            closeStream();
            return;
          }
        } catch (err) {
          clearTimeout(timeoutId);
          if (hasContent) {
            // Partial stream — close without done so the client sees it as truncated, not success
            closeStream();
            return;
          }
          if (streamClosed) return;
          console.warn(`[llm-stream:${providerName}] ${(err as Error).message}`);
        }
      }

      if (!streamClosed) {
        emit({ error: 'llm_unavailable' });
        closeStream();
      }
    },
    cancel() {
      // Client disconnected — abort the active provider fetch immediately
      streamClosed = true;
      activeController?.abort();
    },
  });
}

export async function callLlm(opts: LlmCallOptions): Promise<LlmCallResult | null> {
  const {
    messages: rawMessages,
    temperature = 0.3,
    maxTokens = 1500,
    timeoutMs = 25_000,
    provider: forcedProvider,
    providerOrder,
    modelOverrides,
    stripThinkingTags: shouldStrip = true,
    validate,
    systemAppend,
  } = opts;

  let messages = rawMessages;
  const firstMsg = messages[0];
  if (systemAppend && firstMsg && firstMsg.role === 'system') {
    const sanitized = sanitizeForPrompt(systemAppend);
    if (sanitized) {
      messages = [
        { role: 'system', content: `${firstMsg.content}\n\n---\n\n${sanitized}` },
        ...messages.slice(1),
      ];
    }
  }

  const providers = resolveProviderChain({ forcedProvider, providerOrder });

  for (const providerName of providers) {
    const creds = getProviderCredentials(providerName, {
      model: modelOverrides?.[providerName as LlmProviderName],
    });
    if (!creds) {
      if (forcedProvider) return null;
      continue;
    }

    // Health gate: skip provider if endpoint is unreachable
    if (!(await isProviderAvailable(creds.apiUrl))) {
      console.warn(`[llm:${providerName}] Offline, skipping`);
      if (forcedProvider) return null;
      continue;
    }

    try {
      const resp = await fetch(creds.apiUrl, {
        method: 'POST',
        headers: { ...creds.headers, 'User-Agent': CHROME_UA },
        body: JSON.stringify(buildLlmRequestBody(creds, messages, { temperature, maxTokens })),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!resp.ok) {
        console.warn(`[llm:${providerName}] HTTP ${resp.status}`);
        if (forcedProvider) return null;
        continue;
      }

      const data = (await resp.json()) as any;

      let content = extractLlmText(creds, data);
      if (!content) {
        if (forcedProvider) return null;
        continue;
      }

      const tokens = data.usage?.total_tokens ?? data.usage?.input_tokens ?? 0;

      if (shouldStrip) {
        content = stripThinkingTags(content);
        if (!content) {
          if (forcedProvider) return null;
          continue;
        }
      }

      // Strip markdown code fences (e.g. ```json ... ```) that some models add
      content = content.replace(/^```(?:\w+)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

      if (validate && !validate(content)) {
        console.warn(`[llm:${providerName}] validate() rejected response, trying next`);
        if (forcedProvider) return null;
        continue;
      }

      return { content, model: creds.model, provider: providerName, tokens };
    } catch (err) {
      console.warn(`[llm:${providerName}] ${(err as Error).message}`);
      if (forcedProvider) return null;
    }
  }

  return null;
}
