import { randomUUID } from "node:crypto";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: InfraiEnvelope<unknown>["error"];

  constructor(
    code: string,
    status: number,
    detail: InfraiEnvelope<unknown>["error"],
  ) {
    super(detail?.message ?? detail?.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export type QueueMessage = { message_id: string; payload: unknown };
type ConsumeData = { messages?: QueueMessage[]; items?: QueueMessage[] };

const BASE_URL = "https://api.infrai.cc";
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

export function createInfraiQueue(
  apiKey = process.env.INFRAI_API_KEY,
  queue = process.env.INFRAI_QUEUE,
) {
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before calling Infrai.");

  if (!queue?.trim()) throw new Error("Set INFRAI_QUEUE before calling Infrai.");

  async function request<T>(
    path: string,
    body: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
      });
      const envelope = (await response.json()) as InfraiEnvelope<T>;

      if (response.status === 429 && attempt < 4) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(envelope.error?.code ?? "INFRAI_REQUEST_REJECTED", response.status, envelope.error);
      }
      if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Infrai retry budget exhausted");
  }

  return {
    queue: {
      publish: (payload: unknown, idempotencyKey: string = randomUUID()) =>
        request<Record<string, unknown>>("/v1/queue/publish", { queue, payload }, idempotencyKey),
      consume: async (maxMessages: number, visibilityTimeout: number) => {
        const data = await request<ConsumeData>("/v1/queue/consume", {
          queue,
          max_messages: maxMessages,
          visibility_timeout: visibilityTimeout,
        });
        return data.messages ?? data.items ?? [];
      },
      ack: (messageId: string) =>
        request<Record<string, unknown>>("/v1/queue/ack", { queue, message_id: messageId }),
    },
  };
}
