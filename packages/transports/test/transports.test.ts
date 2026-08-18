import { describe, expect, it, vi } from "vitest";
import { createLogger } from "aegislog";
import { OpenTelemetrySink } from "../src/otel.js";
import { HttpBatchSink } from "../src/http.js";
import { MongoBatchSink } from "../src/mongo.js";

describe("AegisLog Transports", () => {
  it("batches and flushes OpenTelemetry OTLP log entries", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("{}"));

    const otelSink = new OpenTelemetrySink({
      endpoint: "http://localhost:4318/v1/logs",
      serviceName: "order-service",
      serviceVersion: "2.0.0",
    });

    const logger = createLogger({ sinks: [otelSink] });

    logger.info("Payment authorization started", { orderId: "ord_991" });
    await otelSink.flush();

    expect(fetchSpy).toHaveBeenCalled();
    const [url, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:4318/v1/logs");
    const body = JSON.parse(requestInit.body as string);
    expect(body.resourceLogs[0]?.resource?.attributes[0]?.value?.stringValue).toBe("order-service");
    expect(body.resourceLogs[0]?.scopeLogs[0]?.logRecords[0]?.body?.stringValue).toBe(
      "Payment authorization started",
    );

    fetchSpy.mockRestore();
  });

  it("batches and flushes HTTP batch sink entries", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("{}"));

    const httpSink = new HttpBatchSink({
      url: "https://logs.example.com/ingest",
      batchSize: 2,
    });

    const logger = createLogger({ sinks: [httpSink] });

    logger.info("First message");
    logger.warn("Second message triggering batch flush");

    // Batch size reached, auto flush
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchSpy).toHaveBeenCalled();
    const [url, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://logs.example.com/ingest");
    const body = JSON.parse(requestInit.body as string);
    expect(body.logs.length).toBe(2);

    fetchSpy.mockRestore();
  });

  it("batches and flushes MongoDB log entries and audit records", async () => {
    const logDocs: any[] = [];
    const auditDocs: any[] = [];

    const mockCollection = {
      insertMany: vi.fn(async (docs: any[]) => {
        logDocs.push(...docs);
        return { acknowledged: true, insertedCount: docs.length };
      }),
    };

    const mockAuditCollection = {
      insertMany: vi.fn(async (docs: any[]) => {
        auditDocs.push(...docs);
        return { acknowledged: true, insertedCount: docs.length };
      }),
    };

    const mongoSink = new MongoBatchSink({
      collection: mockCollection,
      auditCollection: mockAuditCollection,
      batchSize: 2,
    });

    const logger = createLogger({ sinks: [mongoSink] });

    logger.info("Patient record created", { patientId: "p_101" });
    logger.warn("High risk observation flagged", { patientId: "p_101" });

    // Batch size reached (2 logs), auto flush
    await new Promise((r) => setTimeout(r, 50));

    expect(mockCollection.insertMany).toHaveBeenCalledTimes(1);
    expect(logDocs.length).toBe(2);
    expect(logDocs[0].message).toBe("Patient record created");
    expect(logDocs[1].message).toBe("High risk observation flagged");

    // Test audit record to dedicated collection
    await logger.audit.record({
      action: "patient.viewed_clinical_history",
      resource: { type: "patient", id: "p_101" },
    });

    await mongoSink.flush();

    expect(mockAuditCollection.insertMany).toHaveBeenCalledTimes(1);
    expect(auditDocs.length).toBe(1);
    expect(auditDocs[0].action).toBe("patient.viewed_clinical_history");
  });

  it("handles errors gracefully via onError callback in MongoBatchSink", async () => {
    const onErrorSpy = vi.fn();
    const failingCollection = {
      insertMany: vi.fn(async () => {
        throw new Error("Mongo connection lost");
      }),
    };

    const mongoSink = new MongoBatchSink({
      collection: failingCollection,
      onError: onErrorSpy,
    });

    const logger = createLogger({ sinks: [mongoSink] });
    logger.error("DB query timeout");

    await mongoSink.flush();

    expect(failingCollection.insertMany).toHaveBeenCalled();
    expect(onErrorSpy).toHaveBeenCalledTimes(1);
    expect(onErrorSpy.mock.calls[0][0].message).toBe("Mongo connection lost");
    expect(onErrorSpy.mock.calls[0][1][0].message).toBe("DB query timeout");
  });
});
