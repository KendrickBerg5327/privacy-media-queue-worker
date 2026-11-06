import { CreatorRateLimiter } from "./creator_limiter.js";
import { createInfraiQueue } from "./infrai_queue.js";
import { MediaIngestion, processMedia, type CreatorDelivery } from "./media_job.js";

export type QueuePort = {
  queue: {
    consume(maxMessages: number, visibilityTimeout: number): Promise<Array<{ message_id: string; payload: unknown }>>;
    ack(messageId: string): Promise<unknown>;
  };
};

export async function consumeOnce(
  infrai: QueuePort,
  limiter: CreatorRateLimiter,
  process: (job: MediaIngestion) => Promise<CreatorDelivery> = processMedia,
): Promise<CreatorDelivery[]> {
  const messages = await infrai.queue.consume(4, 60);
  return Promise.all(messages.map(async (message) => {
    const job = MediaIngestion.parse(message.payload);
    const delivery = await limiter.schedule(job.creatorId, () => process(job));
    await infrai.queue.ack(message.message_id);
    return delivery;
  }));
}

async function main() {
  const infrai = createInfraiQueue();
  const deliveries = await consumeOnce(infrai, new CreatorRateLimiter(1_000));
  process.stdout.write(`${JSON.stringify(deliveries, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
