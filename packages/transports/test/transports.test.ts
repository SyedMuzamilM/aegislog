import { describe, expect, it, vi } from "vitest";
import { createLogger } from "aegislog";
import { OpenTelemetrySink } from "../src/otel.js";
import { HttpBatchSink } from "../src/http.js";
import { MongoBatchSink } from "../src/mongo.js";
import { LokiBatchSink, GrafanaLokiSink } from "../src/loki.js";

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
    const attributes = body.resourceLogs[0]?.scopeLogs[0]?.logRecords[0]?.attributes;
    expect(attributes).toContainEqual({
      key: "meta",
      value: {
        kvlistValue: {
          values: [{ key: "orderId", value: { stringValue: "ord_991" } }],
        },
      },
    });

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
    let shouldFail = true;
    const failingCollection = {
      insertMany: vi.fn(async () => {
        if (shouldFail) {
          throw new Error("Mongo connection lost");
        }
        return { acknowledged: true };
      }),
    };

    const mongoSink = new MongoBatchSink({
      collection: failingCollection,
      onError: onErrorSpy,
    });

    const logger = createLogger({ sinks: [mongoSink] });
    logger.error("DB query timeout");

    await expect(mongoSink.flush()).rejects.toThrow("Mongo connection lost");

    expect(failingCollection.insertMany).toHaveBeenCalled();
    expect(onErrorSpy).toHaveBeenCalledTimes(1);
    expect(onErrorSpy.mock.calls[0][0].message).toBe("Mongo connection lost");
    expect(onErrorSpy.mock.calls[0][1][0].message).toBe("DB query timeout");

    shouldFail = false;
    await mongoSink.flush();
    expect(failingCollection.insertMany).toHaveBeenCalledTimes(2);
  });

  it("keeps HTTP batches queued when the server rejects delivery", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const sink = new HttpBatchSink({
      url: "https://logs.example.com/ingest",
      flushIntervalMs: 60_000,
    });

    sink.log({
      level: "error",
      message: "Retain me",
      timestamp: "2026-08-18T10:00:00.000Z",
    });

    await expect(sink.flush()).rejects.toThrow("HTTP 503");
    await sink.flush();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const retriedBody = JSON.parse(fetchSpy.mock.calls[1]?.[1]?.body as string);
    expect(retriedBody.logs[0].message).toBe("Retain me");
    fetchSpy.mockRestore();
  });

  it("supports direct Mongoose model and mongoSink.query helper", async () => {
    const storedDocs = [
      {
        message: "Order placed",
        level: "info",
        timestamp: "2026-08-18T10:00:00.000Z",
        context: { actor: { id: "usr_1" }, tenant: { id: "org_1" }, requestId: "req_1" },
      },
      {
        message: "Payment failed",
        level: "error",
        timestamp: "2026-08-18T10:05:00.000Z",
        context: { actor: { id: "usr_1" }, tenant: { id: "org_1" }, requestId: "req_2" },
      },
    ];

    const mockMongooseModel = {
      collection: { name: "systemlogs" },
      insertMany: vi.fn(async (docs: any[]) => {
        storedDocs.push(...docs);
        return docs;
      }),
      find: vi.fn(() => ({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn(async () => storedDocs),
      })),
      countDocuments: vi.fn(async () => storedDocs.length),
    };

    const mongoSink = new MongoBatchSink({
      model: mockMongooseModel,
    });

    const logger = createLogger({ sinks: [mongoSink] });
    logger.info("New event via Mongoose model");
    await mongoSink.flush();

    expect(mockMongooseModel.insertMany).toHaveBeenCalled();

    // Query helper test
    const result = await mongoSink.query({
      actorId: "usr_1",
      limit: 10,
    });

    expect(mockMongooseModel.find).toHaveBeenCalled();
    expect(result.items.length).toBeGreaterThanOrEqual(2);
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.page).toBe(1);
  });

  it("batches and pushes formatted streams to Grafana Loki API (/loki/api/v1/push)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(null, { status: 204 }));

    const lokiSink = new LokiBatchSink({
      host: "http://localhost:3100",
      labels: { app: "payments-service", env: "production" },
      batchSize: 2,
    });

    const logger = createLogger({ sinks: [lokiSink] });

    logger.info("Order initialized", { orderId: "ord_101" });
    logger.error("Payment gateway timeout", { orderId: "ord_101", error: new Error("ETIMEDOUT") });

    await lokiSink.flush();

    expect(fetchSpy).toHaveBeenCalled();
    const [url, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3100/loki/api/v1/push");
    expect(requestInit.method).toBe("POST");

    const payload = JSON.parse(requestInit.body as string);
    expect(payload.streams).toBeDefined();
    // 2 streams: one for level=info and one for level=error
    expect(payload.streams.length).toBe(2);

    const infoStream = payload.streams.find(
      (s: any) => s.stream.level === "info" && s.stream.app === "payments-service",
    );
    expect(infoStream).toBeDefined();
    expect(infoStream.values[0][1]).toContain("Order initialized");
    expect(infoStream.values[0][1]).toContain("ord_101");

    const errorStream = payload.streams.find(
      (s: any) => s.stream.level === "error" && s.stream.app === "payments-service",
    );
    expect(errorStream).toBeDefined();
    expect(errorStream.values[0][1]).toContain("Payment gateway timeout");

    // Also verify GrafanaLokiSink alias
    expect(GrafanaLokiSink).toBe(LokiBatchSink);

    fetchSpy.mockRestore();
  });

  it("handles audit trails with dedicated audit labels in Loki", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(null, { status: 204 }));

    const lokiSink = new LokiBatchSink({
      host: "http://localhost:3100",
      labels: { app: "auth-service" },
    });

    const logger = createLogger({ sinks: [lokiSink] });

    await logger.audit.record({
      action: "user.role_promoted",
      resource: { type: "user", id: "usr_99" },
      outcome: "success",
    });

    await lokiSink.flush();

    expect(fetchSpy).toHaveBeenCalled();
    const [, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(requestInit.body as string);

    const auditStream = payload.streams.find((s: any) => s.stream.type === "audit");
    expect(auditStream).toBeDefined();
    expect(auditStream.stream.action).toBe("user_role_promoted");
    expect(auditStream.stream.outcome).toBe("success");
    expect(auditStream.values[0][1]).toContain("[AUDIT] user.role_promoted on user:usr_99");

    fetchSpy.mockRestore();
  });

  it("supports multi-tenancy and authentication for Grafana Cloud", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(null, { status: 204 }));

    const lokiSink = new LokiBatchSink({
      host: "https://logs-prod-us-central1.grafana.net",
      tenantId: "tenant_acme_prod",
      basicAuth: {
        username: "12345",
        password: "glc_secret_token",
      },
    });

    lokiSink.log({
      level: "info",
      message: "Grafana cloud test",
      timestamp: new Date().toISOString(),
    });

    await lokiSink.flush();

    expect(fetchSpy).toHaveBeenCalled();
    const [url, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://logs-prod-us-central1.grafana.net/loki/api/v1/push");

    const headers = requestInit.headers as Record<string, string>;
    expect(headers["X-Scope-OrgID"]).toBe("tenant_acme_prod");
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("12345:glc_secret_token").toString("base64")}`,
    );

    fetchSpy.mockRestore();
  });

  it("triggers onError callback and retains failed entries upon HTTP error", async () => {
    const onErrorSpy = vi.fn();
    let shouldFail = true;

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (shouldFail) {
        return new Response("Service Unavailable", {
          status: 503,
          statusText: "Service Unavailable",
        });
      }
      return new Response(null, { status: 204 });
    });

    const lokiSink = new LokiBatchSink({
      host: "http://localhost:3100",
      onError: onErrorSpy,
    });

    lokiSink.log({
      level: "error",
      message: "Database down",
      timestamp: new Date().toISOString(),
    });

    await expect(lokiSink.flush()).rejects.toThrow("HTTP 503");
    expect(onErrorSpy).toHaveBeenCalledTimes(1);
    expect(onErrorSpy.mock.calls[0][0].message).toContain("HTTP 503");
    expect(onErrorSpy.mock.calls[0][1][0].message).toBe("Database down");

    // Next flush succeeds and retains entry
    shouldFail = false;
    await lokiSink.flush();
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fetchSpy.mockRestore();
  });

  it("queries historical logs using LogQL via lokiSink.query helper", async () => {
    const mockLokiResponse = {
      status: "success",
      data: {
        resultType: "streams",
        result: [
          {
            stream: { app: "aegislog", level: "error" },
            values: [
              [
                "1725340000000000000",
                JSON.stringify({
                  timestamp: "2026-09-03T00:00:00.000Z",
                  level: "error",
                  message: "Connection pool exhausted",
                  context: { actor: { id: "usr_sarah" }, requestId: "req_99" },
                }),
              ],
            ],
          },
        ],
      },
    };

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify(mockLokiResponse)));

    const lokiSink = new LokiBatchSink({
      host: "http://localhost:3100",
      labels: { app: "aegislog" },
    });

    const result = await lokiSink.query({
      level: "error",
      search: "Connection pool",
      actorId: "usr_sarah",
      limit: 10,
    });

    expect(fetchSpy).toHaveBeenCalled();
    const [requestUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const parsedUrl = new URL(requestUrl);
    expect(parsedUrl.pathname).toBe("/loki/api/v1/query_range");
    expect(parsedUrl.searchParams.get("query")).toContain('{app="aegislog", level="error"}');
    expect(parsedUrl.searchParams.get("query")).toContain('|= "Connection pool"');
    expect(parsedUrl.searchParams.get("query")).toContain('|= "usr_sarah"');
    expect(parsedUrl.searchParams.get("limit")).toBe("10");

    expect(result.items.length).toBe(1);
    expect(result.items[0].line).toContain("Connection pool exhausted");
    expect(result.items[0].data?.message).toBe("Connection pool exhausted");
    expect(result.items[0].labels.level).toBe("error");

    fetchSpy.mockRestore();
  });
});
