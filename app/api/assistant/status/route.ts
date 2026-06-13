import { getOllamaStatus } from '@/assistant/ollama';
import { json } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const ollama = await getOllamaStatus();
  return json({
    typedTools: {
      available: true,
      tools: ['cashflow', 'category_spend', 'merchant_search', 'tax_evidence', 'subscriptions', 'review_queue', 'provenance'],
    },
    ollama,
    fallback: {
      deterministicTypedToolAnswers: true,
      activeWhen: ollama.status === 'available' && ollama.modelAvailable ? 'ollama_error' : 'ollama_unavailable',
    },
  });
}
