export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🛡️ AegisLog Dev Inspector</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090a0f;
      --card-bg: #12141c;
      --card-border: #1e2230;
      --text: #e2e8f0;
      --text-muted: #8492a6;
      --accent: #3b82f6;
      --info: #38bdf8;
      --warn: #fbbf24;
      --error: #f43f5e;
      --audit: #c084fc;
      --success: #34d399;
      --font-sans: 'Plus Jakarta Sans', system-ui, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: var(--card-bg);
      border-bottom: 1px solid var(--card-border);
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 1.15rem;
      letter-spacing: -0.02em;
    }
    .brand span { color: var(--accent); }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
    }
    .stats {
      display: flex;
      gap: 16px;
    }
    .stat-pill {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--card-border);
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 0.8rem;
      font-family: var(--font-mono);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .toolbar {
      background: #0d0f17;
      border-bottom: 1px solid var(--card-border);
      padding: 12px 24px;
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .search-box {
      flex: 1;
      min-width: 240px;
      position: relative;
    }
    .search-box input {
      width: 100%;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: #fff;
      padding: 8px 14px;
      border-radius: 8px;
      font-family: var(--font-sans);
      font-size: 0.88rem;
      outline: none;
    }
    .search-box input:focus { border-color: var(--accent); }
    .filter-btn {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 600;
      transition: all 0.15s ease;
    }
    .filter-btn.active {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }
    .filter-btn.active.warn { background: var(--warn); color: #000; }
    .filter-btn.active.error { background: var(--error); color: #fff; }
    .filter-btn.active.audit { background: var(--audit); color: #000; }
    .btn-action {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 500;
    }
    .btn-action:hover { background: rgba(255, 255, 255, 0.1); }
    main {
      flex: 1;
      padding: 20px 24px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .empty-state {
      text-align: center;
      padding: 80px 20px;
      color: var(--text-muted);
    }
    .log-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 12px 16px;
      font-family: var(--font-mono);
      font-size: 0.84rem;
      transition: border-color 0.15s ease;
    }
    .log-card:hover { border-color: rgba(255, 255, 255, 0.15); }
    .log-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .log-meta-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .badge {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge-info { background: rgba(56, 189, 248, 0.15); color: var(--info); }
    .badge-debug { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
    .badge-warn { background: rgba(251, 191, 36, 0.15); color: var(--warn); }
    .badge-error { background: rgba(244, 63, 94, 0.15); color: var(--error); }
    .badge-audit { background: rgba(192, 132, 252, 0.15); color: var(--audit); }
    .badge-fatal { background: var(--error); color: #fff; }
    .log-time { color: var(--text-muted); font-size: 0.76rem; }
    .log-user {
      background: rgba(59, 130, 246, 0.1);
      color: #93c5fd;
      border: 1px solid rgba(59, 130, 246, 0.2);
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 0.74rem;
    }
    .log-msg {
      margin-top: 6px;
      color: #fff;
      line-height: 1.5;
      word-break: break-word;
    }
    .log-details {
      margin-top: 10px;
      background: #090a0f;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      padding: 10px;
      font-size: 0.78rem;
      color: #94a3b8;
      overflow-x: auto;
      max-height: 250px;
    }
    .stack-trace {
      color: var(--error);
      margin-top: 8px;
      white-space: pre-wrap;
      font-size: 0.76rem;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="status-dot"></div>
      🛡️ AegisLog <span>Dev Inspector</span>
    </div>
    <div class="stats">
      <div class="stat-pill">Total: <span id="stat-total">0</span></div>
      <div class="stat-pill" style="color: var(--error)">Errors: <span id="stat-errors">0</span></div>
      <div class="stat-pill" style="color: var(--audit)">Audit: <span id="stat-audit">0</span></div>
    </div>
  </header>

  <div class="toolbar">
    <div class="search-box">
      <input type="text" id="search-input" placeholder="Filter by message, user, requestId, error...">
    </div>
    <button class="filter-btn active" data-level="all">All</button>
    <button class="filter-btn" data-level="info">Info</button>
    <button class="filter-btn warn" data-level="warn">Warn</button>
    <button class="filter-btn error" data-level="error">Error</button>
    <button class="filter-btn audit" data-level="audit">Audit</button>
    <button class="btn-action" id="btn-clear">Clear</button>
    <button class="btn-action" id="btn-pause">Pause Stream</button>
  </div>

  <main id="logs-container">
    <div class="empty-state">
      <h3>Waiting for incoming logs...</h3>
      <p style="margin-top: 8px; font-size: 0.88rem;">Send logs from your app using <code>createLogger()</code> or <code>DevViewerSink</code>.</p>
    </div>
  </main>

  <script>
    const logs = [];
    let activeFilter = 'all';
    let searchQuery = '';
    let isPaused = false;

    const container = document.getElementById('logs-container');
    const statTotal = document.getElementById('stat-total');
    const statErrors = document.getElementById('stat-errors');
    const statAudit = document.getElementById('stat-audit');
    const searchInput = document.getElementById('search-input');
    const btnClear = document.getElementById('btn-clear');
    const btnPause = document.getElementById('btn-pause');

    let errorCount = 0;
    let auditCount = 0;

    function renderLogs() {
      const filtered = logs.filter(item => {
        if (activeFilter !== 'all') {
          if (activeFilter === 'audit' && item.type !== 'audit') return false;
          if (activeFilter !== 'audit' && item.level !== activeFilter) return false;
        }
        if (searchQuery) {
          const raw = JSON.stringify(item).toLowerCase();
          if (!raw.includes(searchQuery)) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No logs match your filter</h3></div>';
        return;
      }

      container.innerHTML = filtered.slice(-200).reverse().map(item => {
        const isAudit = item.type === 'audit' || item.action;
        const level = isAudit ? 'audit' : (item.level || 'info');
        const time = (item.timestamp || new Date().toISOString()).split('T')[1].slice(0, 8);
        const user = item.actor?.email || item.actor?.id || item.context?.actor?.email || item.context?.actor?.id;
        const reqId = item.requestId || item.context?.requestId;

        let detailsHtml = '';
        const meta = item.meta || item.changes || item.details;
        if (meta && Object.keys(meta).length > 0) {
          detailsHtml = '<pre class="log-details">' + JSON.stringify(meta, null, 2) + '</pre>';
        }

        let errorHtml = '';
        if (item.error) {
          errorHtml = '<div class="stack-trace">' + (item.error.stack || item.error.message || JSON.stringify(item.error)) + '</div>';
        }

        return '<div class="log-card">' +
          '<div class="log-header">' +
            '<div class="log-meta-left">' +
              '<span class="badge badge-' + level + '">' + level.toUpperCase() + '</span>' +
              (user ? '<span class="log-user">👤 ' + user + '</span>' : '') +
              (reqId ? '<span class="log-time">ID: ' + reqId.slice(0, 8) + '</span>' : '') +
              (item.namespace ? '<span class="log-time">(' + item.namespace + ')</span>' : '') +
            '</div>' +
            '<span class="log-time">' + time + '</span>' +
          '</div>' +
          '<div class="log-msg">' + (isAudit ? '➔ ' + item.action + ' on ' + JSON.stringify(item.resource) : item.message) + '</div>' +
          detailsHtml +
          errorHtml +
        '</div>';
      }).join('');
    }

    function connectSSE() {
      const evtSource = new EventSource('/api/stream');
      evtSource.onmessage = (e) => {
        if (isPaused) return;
        try {
          const item = JSON.parse(e.data);
          logs.push(item);
          statTotal.textContent = logs.length;
          if (item.level === 'error' || item.level === 'fatal') {
            errorCount++;
            statErrors.textContent = errorCount;
          }
          if (item.type === 'audit' || item.action) {
            auditCount++;
            statAudit.textContent = auditCount;
          }
          renderLogs();
        } catch {}
      };
      evtSource.onerror = () => {
        setTimeout(connectSSE, 2000);
      };
    }

    connectSSE();

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.level;
        renderLogs();
      });
    });

    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderLogs();
    });

    btnClear.addEventListener('click', () => {
      logs.length = 0;
      errorCount = 0;
      auditCount = 0;
      statTotal.textContent = '0';
      statErrors.textContent = '0';
      statAudit.textContent = '0';
      renderLogs();
    });

    btnPause.addEventListener('click', () => {
      isPaused = !isPaused;
      btnPause.textContent = isPaused ? 'Resume Stream' : 'Pause Stream';
    });
  </script>
</body>
</html>`;
