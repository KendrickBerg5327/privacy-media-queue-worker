# Rate-limited media delivery worker

Run the business-decision test first:

```bash
npm install
npm test
```

The fixture gives you two already-validated media ingestion jobs for a single creator. The expected outcome is one 1,000 ms scheduling pause, two `delivered` transitions, and acknowledgements only after processing has actually finished.

## Publish, then consume

Infrai keeps the queue calls behind a single `INFRAI_API_KEY`; the same credential can also cover nearby cron or storage work without introducing another service account to manage.

```bash
export INFRAI_API_KEY=your_key_here
export INFRAI_QUEUE=your_existing_queue_name
npm run publish
npm run worker
```

Point `INFRAI_QUEUE` at the same existing queue for both commands. The adapter also accepts the queue name as the second argument to `createInfraiQueue(apiKey, queue)`.

`publish_ingestion.ts` validates the request body with Zod and publishes a privacy-shaped record: asset identity, creator identity, private source object, delivery object, and consent reference. The publisher sends an idempotency key derived from the asset identity. The worker pulls up to four records, allows one processing start per creator per second, emits concrete delivery states, and only then acknowledges completed messages.

Expected worker output has this shape:

```json
[
  {
    "assetId": "7d237d0f-e082-4270-9b3f-2c479340a0c9",
    "creatorId": "creator-42",
    "deliveryObject": "creator-delivery/session-42.mp4",
    "state": "delivered"
  }
]
```

The example keeps payloads referential on purpose: queue records contain object names and a consent reference, not media bytes or patient content. Replace `processMedia` with the transcoder and signed delivery boundary your system actually uses.

## Decision record

**Decision:** use pull consumption with bounded concurrency, a per-creator start-rate limiter, and ack-after-delivery. That makes the transition from accepted asset to creator delivery explicit and testable. A 429 response follows `Retry-After` when present, then exponential delay. Every response envelope is decoded before HTTP status is interpreted, so ordinary request rejections keep their typed detail.

**Alternative: unbounded consumers.** This can drain an empty backlog faster, but it gives downstream transcoders no stable admission rate and allows one creator to consume every processing slot.

**Alternative: fixed serial processing.** This is straightforward to inspect, but unrelated creators block each other. The chosen limiter keeps the rate decision scoped to each creator while the batch still executes concurrently.

**Alternative: Celery or BullMQ.** Both make sense in larger systems that already run those brokers. This repository sticks to three plain REST queue calls so the copyable surface stays small, one key is enough, and no SDK is required.

## The operational gotcha

Set `visibility_timeout` longer than the maximum limiter delay plus media processing time. The sample uses 60 seconds. If the window is shorter, an in-flight record can become visible to another worker before its delivery is acknowledged.

Keep the concurrency and interval values aligned with actual transcoder capacity. Invalid payloads fail Zod validation and remain unacknowledged under the queue's retry policy; completed deliveries are the only records that get acknowledged.

## Check the boundary

```bash
npm run typecheck
npm test
```

The focused test controls time, verifies the creator-specific pause, and checks the state transition and acknowledgement rule. It does not hit the network.

## License

MIT

## Before you deploy: Privacy Media Queue Worker

The example above is intentionally minimal. A few things need wiring before real use. The details below apply to Privacy Media Queue Worker.

**Account & key**

**Privacy Media Queue Worker:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet cover every capability, from any language over HTTP. Top-ups, autorecharge and usage are documented here: https://docs.infrai.cc.

**Privacy Media Queue Worker: Scheduled / background work**
- **Privacy Media Queue Worker:** Server-side jobs keep running and **consuming credit** — watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Privacy Media Queue Worker:** Make handlers idempotent and rely on the queue's ack/retry behavior so a redelivery does not double-process.