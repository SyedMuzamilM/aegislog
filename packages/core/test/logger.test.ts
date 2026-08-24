import { describe, expect, it, vi } from "vitest";
import { MemorySink } from "../src/sinks.js";
import { createLogger } from "../src/logger.js";
import { runWithContext, setActor, setTenant } from "../src/context.js";
import { formatDevLog } from "../src/formatters/dev.js";
import { formatJsonLog } from "../src/formatters/json.js";

describe("AegisLog Core Engine", () => {
  it("logs messages and attaches metadata", () => {
    const memory = new MemorySink();
    const logger = createLogger({ sinks: [memory], level: "debug" });

    logger.info("System online", { port: 3000 });

    expect(memory.entries.length).toBe(1);
    expect(memory.entries[0]?.message).toBe("System online");
    expect(memory.entries[0]?.meta?.port).toBe(3000);
    expect(memory.entries[0]?.level).toBe("info");
  });

  it("automatically attaches ambient AsyncLocalStorage context", async () => {
    const memory = new MemorySink();
    const logger = createLogger({ sinks: [memory] });

    await runWithContext(
      {
        requestId: "req_12345",
        actor: { id: "usr_sarah", email: "sarah@acme.com" },
        tenant: { id: "org_acme" },
      },
      async () => {
        logger.info("Creating project", { projectName: "Apollo" });

        // Simulate nested helper function
        await (async () => {
          logger.warn("Approaching quota");
        })();
      },
    );

    expect(memory.entries.length).toBe(2);
    expect(memory.entries[0]?.context?.actor?.id).toBe("usr_sarah");
    expect(memory.entries[0]?.context?.tenant?.id).toBe("org_acme");
    expect(memory.entries[0]?.context?.requestId).toBe("req_12345");

    expect(memory.entries[1]?.context?.actor?.id).toBe("usr_sarah");
  });

  it("supports late binding of actor and tenant", async () => {
    const memory = new MemorySink();
    const logger = createLogger({ sinks: [memory] });

    await runWithContext({ requestId: "req_auth" }, async () => {
      logger.info("Login attempt");

      // Late authentication
      setActor({ id: "usr_late", email: "late@user.com" });
      setTenant({ id: "org_late" });

      logger.info("Login success");
    });

    expect(memory.entries.length).toBe(2);
    expect(memory.entries[0]?.context?.actor).toBeUndefined();
    expect(memory.entries[1]?.context?.actor?.id).toBe("usr_late");
  });

  it("sanitizes sensitive keys and secret tokens via Helmet Shield", () => {
    const memory = new MemorySink();
    const logger = createLogger({ sinks: [memory] });

    logger.error("Failed request", {
      headers: {
        authorization:
          "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeak",
      },
      user: {
        password: "SuperSecret123!",
        apiKey: "sk-1234567890abcdef1234567890abcdef",
        creditCard: "4111 2222 3333 4444",
      },
    });

    expect(memory.entries.length).toBe(1);
    const meta = memory.entries[0]?.meta as Record<string, unknown>;
    const headers = meta?.headers as Record<string, unknown>;
    const user = meta?.user as Record<string, unknown>;

    expect(headers?.authorization).toBe("[REDACTED]");
    expect(user?.password).toBe("[REDACTED]");
    expect(user?.apiKey).toBe("[REDACTED]");
    expect(user?.creditCard).toBe("[REDACTED]");
  });

  it("sanitizes documented key variants and default metadata", () => {
    const memory = new MemorySink();
    const logger = createLogger({
      sinks: [memory],
      defaultMeta: { auth_token: "default-token", session: "session-secret", sessionId: "session-1" },
    });

    logger.info("Sensitive variants", {
      accountNumber: "123456",
      routing_number: "987654",
      passport: "P1234",
    });

    expect(memory.entries[0]?.meta).toEqual({
      auth_token: "[REDACTED]",
      session: "[REDACTED]",
      sessionId: "[REDACTED]",
      accountNumber: "[REDACTED]",
      routing_number: "[REDACTED]",
      passport: "[REDACTED]",
    });
  });

  it("keeps custom shield rules on child loggers", () => {
    const memory = new MemorySink();
    const logger = createLogger({
      sinks: [memory],
      shield: { additionalKeys: ["customerTaxId"] },
    });

    logger.child({ namespace: "billing" }).info("Child event", {
      customerTaxId: "tax-123",
    });

    expect(memory.entries[0]?.meta?.customerTaxId).toBe("[REDACTED]");
  });

  it("safely handles circular references without crashing or throwing", () => {
    const memory = new MemorySink();
    const logger = createLogger({ sinks: [memory] });

    const circularObj: Record<string, unknown> = { name: "circular" };
    circularObj.self = circularObj;

    expect(() => {
      logger.info("Testing circular reference", { circularObj });
    }).not.toThrow();

    expect(memory.entries.length).toBe(1);
    const meta = memory.entries[0]?.meta as Record<string, unknown>;
    const loggedCircular = meta?.circularObj as Record<string, unknown>;
    expect(loggedCircular?.self).toBe("[CIRCULAR_REF]");
  });

  it("records audit events with ambient actor and tenant", async () => {
    const memory = new MemorySink();
    const logger = createLogger({ sinks: [memory] });

    await runWithContext(
      {
        actor: { id: "usr_admin", email: "admin@corp.com" },
        tenant: { id: "org_corp" },
      },
      async () => {
        await logger.audit.record({
          action: "user.role_promoted",
          resource: { type: "user", id: "usr_employee_4" },
          changes: { role: { from: "member", to: "admin" } },
        });
      },
    );

    expect(memory.auditRecords.length).toBe(1);
    const record = memory.auditRecords[0];
    expect(record?.action).toBe("user.role_promoted");
    expect(record?.actor?.id).toBe("usr_admin");
    expect(record?.tenant?.id).toBe("org_corp");
    expect(record?.outcome).toBe("success");
  });

  it("sanitizes and snapshots complete audit records", async () => {
    const memory = new MemorySink();
    const logger = createLogger({ sinks: [memory] });
    const resource = { type: "user", id: "usr_1", password: "secret" };

    await logger.audit.record({
      action: "user.updated",
      resource,
      actor: { id: "admin", auth_token: "actor-secret" },
      target: { type: "session", id: "session-1", sessionId: "secret-session" },
      reason: "Authorization: Bearer abcdefghijklmnop",
    });
    resource.id = "mutated";

    const record = memory.auditRecords[0];
    expect(record?.resource.id).toBe("usr_1");
    expect(record?.resource.password).toBe("[REDACTED]");
    expect(record?.actor?.auth_token).toBe("[REDACTED]");
    expect(record?.target?.sessionId).toBe("[REDACTED]");
    expect(record?.reason).not.toContain("abcdefghijklmnop");
  });

  it("flushes in-memory ring buffer on error (Debug-on-Error)", () => {
    const memory = new MemorySink();
    const logger = createLogger({
      level: "info",
      sinks: [memory],
      ringBuffer: { enabled: true, capacity: 10, flushOnError: true },
    });

    logger.debug("Step 1: Parse request");
    logger.debug("Step 2: Connect DB");
    expect(memory.entries.length).toBe(0); // Not logged because level is info

    logger.error("Step 3: DB connection dropped!");
    // Error triggered flush of preceding 2 debug logs + the error itself!
    expect(memory.entries.length).toBe(3);
    expect(memory.entries[0]?.message).toBe("Step 1: Parse request");
    expect(memory.entries[1]?.message).toBe("Step 2: Connect DB");
    expect(memory.entries[2]?.message).toBe("Step 3: DB connection dropped!");
  });

  it("isolates ring buffers by request and discards successful request trails", () => {
    const memory = new MemorySink();
    const logger = createLogger({
      level: "info",
      sinks: [memory],
      ringBuffer: { enabled: true, capacity: 10, flushOnError: true },
    });

    runWithContext({ requestId: "request-a" }, () => logger.debug("request-a debug"));
    runWithContext({ requestId: "request-b" }, () => logger.debug("request-b debug"));
    logger.completeRequest(200, "request-a");
    runWithContext({ requestId: "request-b" }, () => logger.error("request-b error"));

    expect(memory.entries.map((entry) => entry.message)).toEqual([
      "request-b debug",
      "request-b error",
    ]);
  });

  it("flushes a request ring buffer for a 4xx completion", () => {
    const memory = new MemorySink();
    const logger = createLogger({
      level: "info",
      sinks: [memory],
      ringBuffer: { enabled: true },
    });

    runWithContext({ requestId: "request-denied" }, () => logger.debug("authorization check"));
    logger.completeRequest(403, "request-denied");

    expect(memory.entries[0]?.message).toBe("authorization check");
  });

  it("customizes console display with DevDisplayOptions (Helmet for console)", () => {
    const entry = {
      level: "info" as const,
      message: "Processing order",
      timestamp: "2026-08-17T12:00:00.000Z",
      context: {
        requestId: "req_xyz_123",
        actor: { id: "usr_alice", email: "alice@test.com" },
        tenant: { id: "tenant_99" },
      },
      meta: { orderId: "ord_999", secretDebugToken: "internal_123" },
    };

    // 1. Test minimal preset (no timestamp, no context)
    const minimal = formatDevLog(entry, { preset: "minimal" });
    expect(minimal).not.toContain("12:00:00");
    expect(minimal).not.toContain("usr_alice");

    // 2. Test filterMeta
    const filtered = formatDevLog(entry, {
      filterMeta: (key) => key !== "secretDebugToken",
    });
    expect(filtered).toContain("ord_999");
    expect(filtered).not.toContain("internal_123");

    // 3. Test custom badges and icons toggle
    const customBadge = formatDevLog(entry, {
      icons: false,
      badges: { info: "[CUSTOM_INFO]" },
    });
    expect(customBadge).toContain("[CUSTOM_INFO]");
    expect(customBadge).not.toContain("ℹ️");
  });

  it("supports domain-specific redaction via additionalKeys and customPatterns", () => {
    const memory = new MemorySink();
    const logger = createLogger({
      sinks: [memory],
      shield: {
        maskString: "[CLINICAL_REDACTED]",
        additionalKeys: ["consiveDate", "ultrasoundPrescription"],
        customPatterns: [
          /MRN-\d{6}/g,
          {
            pattern: /PATIENT:\s*([A-Z]+)/g,
            replacer: (_match, name) => `PATIENT: [MASKED_${name[0]}]`,
          },
        ],
      },
    });

    logger.info("Patient record updated", {
      consiveDate: "2026-05-12",
      ultrasoundPrescription: "Routine checkup",
      notes: "Patient with MRN-882910 visited. Details: PATIENT: SMITH",
    });

    expect(memory.entries.length).toBe(1);
    const meta = memory.entries[0]?.meta as Record<string, unknown>;
    expect(meta?.consiveDate).toBe("[CLINICAL_REDACTED]");
    expect(meta?.ultrasoundPrescription).toBe("[CLINICAL_REDACTED]");
    expect(meta?.notes).toBe(
      "Patient with [CLINICAL_REDACTED] visited. Details: PATIENT: [MASKED_S]",
    );
  });

  it("supports built-in HIPAA/healthcare and PCI domain presets", () => {
    const memory = new MemorySink();
    const logger = createLogger({
      sinks: [memory],
      shield: {
        preset: ["hipaa", "pci"],
      },
    });

    logger.info("Clinical update", {
      mrn: "MRN-123456",
      conceptionDate: "2026-01-01",
      gestationalAge: "12w4d",
      diagnosis: "Normal",
      patientNotes: "All good",
      pin: "1234",
      cvv: "999",
      body: "Patient with MRN-998811 and SSN: 123-45-6789 attended",
    });

    expect(memory.entries.length).toBe(1);
    const meta = memory.entries[0]?.meta as Record<string, unknown>;
    expect(meta?.mrn).toBe("[REDACTED]");
    expect(meta?.conceptionDate).toBe("[REDACTED]");
    expect(meta?.gestationalAge).toBe("[REDACTED]");
    expect(meta?.diagnosis).toBe("[REDACTED]");
    expect(meta?.patientNotes).toBe("[REDACTED]");
    expect(meta?.pin).toBe("[REDACTED]");
    expect(meta?.cvv).toBe("[REDACTED]");
    expect(meta?.body).toContain("[REDACTED]");
    expect(meta?.body).not.toContain("123-45-6789");
  });

  it("supports logger.flush and gracefulShutdown helper", async () => {
    let flushed = false;
    const customSink = {
      name: "custom-async-sink",
      log: () => {},
      flush: async () => {
        flushed = true;
      },
    };

    const logger = createLogger({
      sinks: [customSink],
      gracefulShutdown: true,
    });

    await logger.flush();
    expect(flushed).toBe(true);

    const cleanup = logger.enableGracefulShutdown();
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("flushes, restores signal handling, and re-sends the shutdown signal", async () => {
    const flush = vi.fn(async () => {});
    const logger = createLogger({ sinks: [{ name: "shutdown", log: () => {}, flush }] });
    const kill = vi.spyOn(process, "kill").mockImplementation((() => true) as typeof process.kill);
    const cleanup = logger.enableGracefulShutdown();
    const handler = process.listeners("SIGTERM").at(-1);

    expect(handler).toBeDefined();
    handler?.("SIGTERM");
    await vi.waitFor(() => expect(kill).toHaveBeenCalledWith(process.pid, "SIGTERM"));
    expect(flush).toHaveBeenCalled();

    cleanup();
    kill.mockRestore();
  });

  it("serializes bigint metadata as a decimal string", () => {
    const memory = new MemorySink();
    const logger = createLogger({ sinks: [memory] });

    logger.info("BigInt metadata", { value: 42n });

    expect(memory.entries[0]?.meta?.value).toBe("42");
    expect(() => formatJsonLog(memory.entries[0]!)).not.toThrow();
  });

  it("flexibly accepts Error instances as first parameter or in meta", () => {
    const memory = new MemorySink();
    const logger = createLogger({ sinks: [memory] });

    const err = new Error("Database timeout");
    logger.error(err, { query: "SELECT * FROM users" });

    expect(memory.entries.length).toBe(1);
    expect(memory.entries[0]?.message).toBe("Database timeout");
    expect(memory.entries[0]?.error?.message).toBe("Database timeout");
    expect(memory.entries[0]?.meta?.query).toBe("SELECT * FROM users");
  });
});
