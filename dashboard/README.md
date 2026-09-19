# Nyx Dashboard

The Nyx dashboard is a React and Vite application that presents the local security workflow, redacted scan findings, evidence-first blast-radius graph, Phantom Runtime terminal events, Honey Mesh results, and targeted remediation actions.

The browser communicates only with the locally running Nyx FastAPI backend over HTTP and WebSocket connections. It never receives raw credential values or persists GitHub personal access tokens after validation.

## Development

```powershell
npm ci
npm run dev
```

Use the FastAPI backend at `http://127.0.0.1:8000`. The Vite development server can be used for UI work, while the production backend serves `dist` after `npm run build`.

## Verification

```powershell
npm run build
npm run lint
```

## Design constraints

- Preserve the explicit Proceed gate between agents. The UI must never advance the pipeline automatically.
- Render only the redacted data supplied by the backend.
- Display Auto-PR success only after the backend returns a real GitHub pull request URL.
- Treat Phantom Runtime output as live only when it arrives through the WebSocket event stream.
