import { randomUUID } from "node:crypto";
import { createInfraiQueue } from "./infrai_queue.js";
import { MediaIngestion } from "./media_job.js";

async function main() {
  const ingestion = MediaIngestion.parse({
    assetId: randomUUID(),
    creatorId: "creator-42",
    sourceObject: "private/intake/session-42.webm",
    deliveryObject: "creator-delivery/session-42.mp4",
    consentReference: "consent-2026-0042",
  });
  const infrai = createInfraiQueue();
  const result = await infrai.queue.publish(ingestion, `media-ingestion:${ingestion.assetId}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
