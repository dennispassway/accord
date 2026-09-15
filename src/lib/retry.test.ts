import { describe, expect, it, vi } from "vitest";
import { withRetry } from "./retry";

const always = () => true;
const never = () => false;
/** Slaat het echte wachten over en legt de gevraagde wachttijden vast. */
function fakeSleep() {
  const waited: number[] = [];
  return {
    waited,
    sleep: (ms: number) => {
      waited.push(ms);
      return Promise.resolve();
    },
  };
}

describe("withRetry", () => {
  it("geeft het resultaat van de eerste geslaagde poging terug zonder te herhalen", async () => {
    const run = vi.fn().mockResolvedValue("ok");

    const result = await withRetry(run, {
      attempts: 3,
      delaysMs: [500, 2000],
      shouldRetry: always,
    });

    expect(result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("probeert opnieuw na een transiënte fout en geeft het latere resultaat terug", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("blip"))
      .mockRejectedValueOnce(new Error("blip"))
      .mockResolvedValue("ok");
    const { sleep, waited } = fakeSleep();

    const result = await withRetry(run, {
      attempts: 3,
      delaysMs: [500, 2000],
      shouldRetry: always,
      sleep,
    });

    expect(result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(3);
    expect(waited).toEqual([500, 2000]);
  });

  it("gooit de laatste fout door zodra de pogingen op zijn", async () => {
    const run = vi.fn().mockRejectedValue(new Error("blijft stuk"));
    const { sleep } = fakeSleep();

    await expect(
      withRetry(run, {
        attempts: 3,
        delaysMs: [1, 1],
        shouldRetry: always,
        sleep,
      }),
    ).rejects.toThrow("blijft stuk");
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("stopt meteen bij een fout die niet opnieuw geprobeerd mag worden", async () => {
    const run = vi.fn().mockRejectedValue(new Error("401"));
    const { sleep, waited } = fakeSleep();

    await expect(
      withRetry(run, {
        attempts: 3,
        delaysMs: [500],
        shouldRetry: never,
        sleep,
      }),
    ).rejects.toThrow("401");
    expect(run).toHaveBeenCalledTimes(1);
    expect(waited).toEqual([]);
  });

  it("houdt de laatste wachttijd aan als er meer pogingen dan wachttijden zijn", async () => {
    const run = vi.fn().mockRejectedValue(new Error("blip"));
    const { sleep, waited } = fakeSleep();

    await expect(
      withRetry(run, {
        attempts: 4,
        delaysMs: [500],
        shouldRetry: always,
        sleep,
      }),
    ).rejects.toThrow("blip");
    expect(waited).toEqual([500, 500, 500]);
  });

  it("doet bij attempts: 1 precies één poging", async () => {
    const run = vi.fn().mockRejectedValue(new Error("blip"));
    const { sleep } = fakeSleep();

    await expect(
      withRetry(run, {
        attempts: 1,
        delaysMs: [500],
        shouldRetry: always,
        sleep,
      }),
    ).rejects.toThrow("blip");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
