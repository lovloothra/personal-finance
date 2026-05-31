/**
 * Shared helpers for the onboarding API route handlers.
 *
 * The app binds to 127.0.0.1 and has no auth; as a defence-in-depth measure we
 * still verify mutating requests originate from the loopback app itself.
 */
import 'server-only';

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(init?.headers ?? {}) },
  });
}

export function badRequest(message: string, status = 400): Response {
  return json({ error: message }, { status });
}

/** Reject cross-origin mutations (loopback-only origin check). */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (!origin) return; // same-origin fetches from server components omit Origin
  const url = new URL(req.url);
  if (new URL(origin).host !== url.host) {
    throw new Error('Cross-origin request rejected.');
  }
}

/**
 * Build a Server-Sent-Events Response driven by an async producer. The producer
 * receives a `send(event)` callback; the stream closes when it resolves.
 */
export function sse(producer: (send: (event: unknown) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        await producer(send);
      } catch (err) {
        send({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
    },
  });
}
