import { describe, expect, it } from "vitest";
import {
  context,
  createLogger,
  formatTraceParent,
  parseTraceParent,
  runWithContext,
} from "../src/index.js";

describe("Trace Context & W3C Trace Correlation (Grafana Tempo)", () => {
  it("parses valid W3C traceparent headers correctly", () => {
    const header = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const parsed = parseTraceParent(header);

    expect(parsed).toBeDefined();
    expect(parsed?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(parsed?.spanId).toBe("00f067aa0ba902b7");
    expect(parsed?.sampled).toBe(true);
  });

  it("handles non-sampled W3C traceparent and returns undefined for invalid formats", () => {
    const nonSampled = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00";
    const parsed = parseTraceParent(nonSampled);
    expect(parsed?.sampled).toBe(false);

    expect(parseTraceParent("")).toBeUndefined();
    expect(parseTraceParent("invalid-header")).toBeUndefined();
    expect(parseTraceParent("00-short-short-01")).toBeUndefined();
  });

  it("formats trace context into a valid W3C traceparent string", () => {
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const spanId = "00f067aa0ba902b7";

    const formatted = formatTraceParent(traceId, spanId, true);
    expect(formatted).toBe("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");

    const defaultSpan = formatTraceParent(traceId);
    expect(defaultSpan).toMatch(/^00-4bf92f3577b34da6a3ce929d0e0e4736-[a-f0-9]{16}-01$/);
  });

  it("dynamically sets and gets traceId and spanId in ambient context", async () => {
    let capturedLogTraceId: string | undefined;
    let capturedLogSpanId: string | undefined;

    const testSink = {
      name: "test-sink",
      log: (entry: any) => {
        capturedLogTraceId = entry.context?.traceId;
        capturedLogSpanId = entry.context?.spanId;
      },
    };

    const logger = createLogger({ sinks: [testSink] });

    await runWithContext({ requestId: "req_1" }, async () => {
      expect(context.getTraceId()).toBeUndefined();
      expect(context.getSpanId()).toBeUndefined();

      context.setTraceId("trace_abc_123");
      context.setSpanId("span_def_456");

      expect(context.getTraceId()).toBe("trace_abc_123");
      expect(context.getSpanId()).toBe("span_def_456");

      logger.info("Executing traced operation");

      expect(capturedLogTraceId).toBe("trace_abc_123");
      expect(capturedLogSpanId).toBe("span_def_456");
    });
  });
});
