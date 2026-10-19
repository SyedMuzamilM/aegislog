import { describe, it, expect } from "vitest";
import { startProfiling, profileOperation } from "../src/index.js";
import { coveredMs, RequestProfile, scrubSpan } from "../src/profiling.js";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";

const span = (id: string, startMs = 10) =>
  ({
    spanContext: () => ({ spanId: id }),
    name: "query",
    startTime: [0, startMs * 1e6],
    instrumentationScope: { name: "mongodb" },
    attributes: {},
  }) as unknown as ReadableSpan;

describe("request profiling", () => {
  it("validates sampling and span limits before starting an SDK", () => {
    expect(() => startProfiling({ sampleRate: -1 })).toThrow(RangeError);
    expect(() => startProfiling({ sampleRate: Number.NaN })).toThrow(RangeError);
    expect(() => startProfiling({ maxSpans: 0 })).toThrow(RangeError);
    expect(() => startProfiling({ otlp: { endpoint: "file:///tmp/trace" } })).toThrow();
    expect(startProfiling({ enabled: false }).enabled).toBe(false);
  });
  it("preserves promise identity outside a sampled request", () => {
    const pending = Promise.resolve("unchanged");
    expect(profileOperation("operation", "application", () => pending)).toBe(pending);
  });
  it("merges parallel and nested intervals", () => {
    expect(
      coveredMs([
        { startMs: 10, durationMs: 40 },
        { startMs: 20, durationMs: 10 },
        { startMs: 35, durationMs: 40 },
        { startMs: 90, durationMs: 10 },
      ]),
    ).toBe(75);
    expect(coveredMs([])).toBe(0);
  });
  it("caps memory and clips unfinished work at response completion", () => {
    const profile = new RequestProfile(0, 1);
    profile.start(span("one"));
    profile.start(span("two"));
    const snapshot = profile.snapshot(30);
    expect(snapshot.operations).toHaveLength(1);
    expect(snapshot.operations[0]).toMatchObject({
      startMs: 10,
      durationMs: 20,
      status: "unfinished",
    });
    expect(snapshot.droppedSpans).toBe(1);
    expect(snapshot.uninstrumentedMs).toBe(10);
    profile.closed = true;
    profile.start(span("three"));
    expect(profile.operations.size).toBe(1);
  });
  it("removes unsafe attributes, exception data and link attributes", () => {
    const input = {
      attributes: { "db.statement": "PRIVATE", "http.url": "PRIVATE", "db.system": "mongodb" },
      events: [{ name: "exception", attributes: { message: "PRIVATE" } }],
      status: { code: 2, message: "PRIVATE" },
      links: [{ attributes: { token: "PRIVATE" } }],
    } as unknown as ReadableSpan;
    scrubSpan(input);
    expect(JSON.stringify(input)).not.toContain("PRIVATE");
    expect(input.attributes).toEqual({ "db.system": "mongodb" });
  });
});
