export interface AssistantSynthesisInput {
  question: string;
  toolCalls: Array<{ tool: string; args: unknown }>;
  toolResult: {
    answer: string;
    aggregates?: unknown;
    evidence?: unknown;
  };
}

export interface OllamaClientOptions {
  url?: string;
  model?: string;
  fetch?: typeof fetch;
}

export type OllamaStatus =
  | { status: 'available'; url: string; model: string; modelAvailable: boolean }
  | { status: 'unavailable'; url: string; model: string; modelAvailable: false; reason: string };

export type OllamaSynthesis =
  | { status: 'ok'; url: string; model: string; answer: string }
  | { status: 'unavailable'; url: string; model: string; reason: string };

const DEFAULT_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen2.5:1.5b';

export function ollamaConfig(options: OllamaClientOptions = {}): Required<Omit<OllamaClientOptions, 'fetch'>> & { fetch: typeof fetch } {
  return {
    url: normalizeUrl(options.url ?? process.env.PF_OLLAMA_URL ?? DEFAULT_URL),
    model: options.model ?? process.env.PF_OLLAMA_MODEL ?? DEFAULT_MODEL,
    fetch: options.fetch ?? fetch,
  };
}

export async function getOllamaStatus(options: OllamaClientOptions = {}): Promise<OllamaStatus> {
  const config = ollamaConfig(options);
  try {
    const response = await config.fetch(`${config.url}/api/tags`);
    if (!response.ok) return unavailable(config, `Ollama tags endpoint returned HTTP ${response.status}.`);
    const body = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
    const modelAvailable = (body.models ?? []).some((item) => item.name === config.model || item.model === config.model);
    return { status: 'available', url: config.url, model: config.model, modelAvailable };
  } catch (err) {
    return unavailable(config, err instanceof Error ? err.message : 'Ollama is not reachable.');
  }
}

export async function synthesizeWithOllama(
  input: AssistantSynthesisInput,
  options: OllamaClientOptions = {},
): Promise<OllamaSynthesis> {
  const config = ollamaConfig(options);
  try {
    const response = await config.fetch(`${config.url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        messages: [
          {
            role: 'system',
            content:
              'You synthesize answers for a local personal-finance ledger. Use only the provided typed tool output. Do not invent SQL, categories, classifications, or unseen transactions. Mention transaction or source ids when they are relevant.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              question: input.question,
              toolCalls: input.toolCalls,
              aggregates: input.toolResult.aggregates ?? null,
              evidence: input.toolResult.evidence ?? null,
              deterministicAnswer: input.toolResult.answer,
            }),
          },
        ],
      }),
    });
    if (!response.ok) return unavailable(config, `Ollama chat endpoint returned HTTP ${response.status}.`);
    const body = (await response.json()) as { message?: { content?: string }; response?: string };
    const answer = (body.message?.content ?? body.response ?? '').trim();
    if (!answer) return unavailable(config, 'Ollama returned an empty answer.');
    return { status: 'ok', url: config.url, model: config.model, answer };
  } catch (err) {
    return unavailable(config, err instanceof Error ? err.message : 'Ollama synthesis failed.');
  }
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/g, '');
}

function unavailable(config: ReturnType<typeof ollamaConfig>, reason: string): OllamaStatus & OllamaSynthesis {
  return {
    status: 'unavailable',
    url: config.url,
    model: config.model,
    modelAvailable: false,
    reason,
  };
}
