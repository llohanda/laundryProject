// Run timer (GDD 9.1). Timer milliseconds = running decision time + cycle costs.
// The clock is injected so tests can drive it; pauses are named so overlapping
// reasons (hidden page during the wash animation, a tutorial card, ...) compose.

export type Clock = () => number;   // monotonic milliseconds, e.g. performance.now
export type PauseReason = 'hidden' | 'washing' | 'card' | 'menu' | 'ended';

export class RunTimer {
  private started = false;
  private readonly pauses = new Set<PauseReason>();
  private accumulatedMs = 0;
  private segmentStart = 0;
  private costMs = 0;

  constructor(private readonly clock: Clock) {}

  get isStarted(): boolean {
    return this.started;
  }

  get isRunning(): boolean {
    return this.started && this.pauses.size === 0;
  }

  /** Starts on the first interaction; later calls do nothing. */
  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.isRunning) this.segmentStart = this.clock();
  }

  pause(reason: PauseReason): void {
    if (this.isRunning) this.accumulatedMs += this.clock() - this.segmentStart;
    this.pauses.add(reason);
  }

  resume(reason: PauseReason): void {
    if (!this.pauses.delete(reason)) return;
    if (this.isRunning) this.segmentStart = this.clock();
  }

  /** Adds a cycle cost instantly (an exact integer, GDD 9.2). */
  addCost(ms: number): void {
    this.costMs += ms;
  }

  /** Integer timer milliseconds; never decreases. */
  nowMs(): number {
    const live = this.isRunning ? this.clock() - this.segmentStart : 0;
    return Math.round(this.accumulatedMs + live) + this.costMs;
  }
}
