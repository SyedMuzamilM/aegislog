import fastify from "fastify";
import { aegisFastifyPlugin } from "@aegislog/fastify";
import { createLogger, defineLogEvent } from "aegislog";

export const logger = createLogger({
  dev: true, // Automatically streams logs to local Dev Inspector
});
export const audit = logger.audit;

const app = fastify({ logger: false });

// Register AegisLog Fastify Plugin
await app.register(aegisFastifyPlugin, {
  logger,
  getActor: (req) => {
    const auth = req.headers.authorization;
    return auth ? { id: "usr_fastify_admin", email: "admin@enterprise.io" } : undefined;
  },
  getTenant: (req) => {
    const tenantId = req.headers["x-tenant-id"] as string;
    return tenantId ? { id: tenantId, slug: "corp-internal" } : undefined;
  },
});

// Define type-safe schema event
interface DeploymentEventData {
  service: string;
  version: string;
  environment: "staging" | "production";
}

const DeploymentEvent = defineLogEvent<string, DeploymentEventData>({
  name: "service.deployed",
  schema: (data: unknown) => {
    const d = data as DeploymentEventData;
    if (!d.service || !d.version || !d.environment) {
      throw new Error("Invalid deployment event payload");
    }
    return d;
  },
});

app.post("/api/deployments", async (req, reply) => {
  const { service, version, environment } = req.body as DeploymentEventData;

  // Log type-safe validated event
  logger.event(DeploymentEvent, {
    service,
    version,
    environment,
  });

  // Business audit trail
  await audit.record({
    action: "infra.deployment_triggered",
    resource: { type: "service", id: service },
    details: { version, environment },
    outcome: "success",
  });

  return reply.code(201).send({ status: "deployment_queued" });
});

const PORT = 3002;
await app.listen({ port: PORT, host: "127.0.0.1" });
logger.info(`⚡ Fastify API listening on http://127.0.0.1:${PORT}`);
