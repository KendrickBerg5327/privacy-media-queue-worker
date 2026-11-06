import assert from "node:assert/strict";
import test from "node:test";
import { CreatorRateLimiter } from "../src/creator_limiter.js";
import { consumeOnce, type QueuePort } from "../src/media_queue_worker.js";

test("spaces work for one creator and acknowledges only completed deliveries", async () => {
  let clock = 0;
  const pauses: number[] = [];
  const acknowledgements: string[] = [];
  const queue: QueuePort = {
    queue: {
      async consume() {
        return [
          { message_id: "m1", payload: { assetId: "7d237d0f-e082-4270-9b3f-2c479340a0c9", creatorId: "creator-7", sourceObject: "private/a.webm", deliveryObject: "delivery/a.mp4", consentReference: "consent-a" } },
          { message_id: "m2", payload: { assetId: "e2ecb67d-c2d9-4370-a95b-dbf4850b113f", creatorId: "creator-7", sourceObject: "private/b.webm", deliveryObject: "delivery/b.mp4", consentReference: "consent-b" } },
        ];
      },
      async ack(messageId) { acknowledgements.push(messageId); },
    },
  };
  const limiter = new CreatorRateLimiter(1_000, () => clock, async (milliseconds) => {
    pauses.push(milliseconds);
    clock += milliseconds;
  });

  const deliveries = await consumeOnce(queue, limiter);

  assert.deepEqual(pauses, [1_000]);
  assert.deepEqual(acknowledgements.sort(), ["m1", "m2"]);
  assert.deepEqual(deliveries.map((delivery) => delivery.state), ["delivered", "delivered"]);
});
