import { describe, expect, it } from "vitest";
import { MemorySink } from "../src/sinks.js";
import { createLogger } from "../src/logger.js";
import { runWithContext, setActor, setTenant } from "../src/context.js";

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
});
