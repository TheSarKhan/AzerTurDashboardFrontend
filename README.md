# AzerTurDashboardFrontend

Operations dashboard · React / Vite / TypeScript.

```sh
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:5173. The Java backend must run on `VITE_API_BASE_URL`. Sign in with `OPERATIONS_USER` / `OPERATIONS_PASSWORD` from the backend's local environment. Credentials are entered at runtime and remain in memory; never place them in a Vite environment variable.

Overview, catalogue and recent quote views use real API/database responses. This is the operations foundation, not a complete booking administration system. Production identity, staff roles, CRUD, reservation assignment and payment reconciliation will be added through backend endpoints.

```sh
npm run build
```

The Dockerfile serves the built static app using unprivileged Nginx. Set `VITE_API_BASE_URL` at build time. See [architecture](docs/ARCHITECTURE.md).
