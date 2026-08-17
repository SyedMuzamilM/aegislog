# Contributing to AegisLog 🛡️

Thank you for your interest in contributing to AegisLog! We are building the next-generation armored logging and user auditing engine for modern TypeScript.

---

## 🛠️ Development Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-org/aegislog.git
   cd aegislog
   ```

2. **Install dependencies with pnpm:**

   ```bash
   pnpm install
   ```

3. **Build all packages:**

   ```bash
   pnpm build
   ```

4. **Run the test suite:**

   ```bash
   pnpm test
   ```

5. **Run the microbenchmarking suite:**

   ```bash
   pnpm bench
   ```

6. **Start the local Dev Inspector:**
   ```bash
   node packages/dev/dist/cli.js --port 4319
   ```

---

## 📐 Architecture & Guidelines

- **0 External Runtime Dependencies for `@aegislog/core`:** The core engine must remain pure and free from heavy production dependencies.
- **Strict TypeScript:** Use strict mode and explicit types for `isolatedDeclarations`.
- **Edge Compatibility:** Never rely on Node.js-only C++ bindings or `worker_threads` inside the core engine.
- **Semantic Commits:** Use standard conventional commit format (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).

---

## 📄 License

MIT © 2026 AegisLog Contributors
