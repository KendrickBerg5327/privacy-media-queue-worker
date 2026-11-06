export class CreatorRateLimiter {
  private readonly nextAllowedAt = new Map<string, number>();
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly pause: (milliseconds: number) => Promise<void>;

  constructor(
    intervalMs: number,
    now: () => number = Date.now,
    pause: (milliseconds: number) => Promise<void> =
      (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {
    this.intervalMs = intervalMs;
    this.now = now;
    this.pause = pause;
  }

  async schedule<T>(creatorId: string, operation: () => Promise<T>): Promise<T> {
    const current = this.now();
    const scheduledAt = Math.max(current, this.nextAllowedAt.get(creatorId) ?? current);
    this.nextAllowedAt.set(creatorId, scheduledAt + this.intervalMs);
    if (scheduledAt > current) await this.pause(scheduledAt - current);
    return operation();
  }
}
