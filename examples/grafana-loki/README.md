# AegisLog + Grafana & Loki Example 📊

Complete example demonstrating full-stack logging, security redaction, and audit trails visualized with **Grafana** and **Grafana Loki**.

Includes an out-of-the-box pre-configured Grafana Dashboard and automatic Loki data source provisioning.

---

## 🚀 Quickstart in 30 Seconds

### 1. Start Grafana & Loki via Docker Compose

```bash
docker compose up -d
```

- **Grafana**: [http://localhost:3000](http://localhost:3000) (Anonymous Admin login pre-configured, no password needed)
- **Loki HTTP API**: `http://localhost:3100`

### 2. Run the AegisLog Simulation

```bash
pnpm install
pnpm start
```

This generates:

- 🛡️ Ambient Context logs with automatic secret redaction (credit cards, passwords)
- 📜 Compliance Audit Records indexed with `type: "audit"`
- 🤖 AI / LLM tracking logs
- 🚨 Error and warning events
- 🔍 Automatic programmatic querying via `lokiSink.query()`

### 3. Open the Dashboard in Grafana

Open [http://localhost:3000](http://localhost:3000) and navigate to **Dashboards > AegisLog > AegisLog Observability & Audit Dashboard**.

You will see:

- Real-time log rates and severity breakdown
- Error and failure counters
- Live log stream viewer with LogQL
- Compliance audit trail panel

---

## 🧹 Teardown

```bash
docker compose down
```
