# AzerTurDashboardFrontend

Operations dashboard · React / Vite / TypeScript.

```sh
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:5173. The Java backend must run on `VITE_API_BASE_URL`. Sign in with your own email and password. For a fresh local database use the `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` from the backend's local environment, then create personal accounts under Staff (administrators only). The session token is entered at runtime and remains in memory; never place credentials in a Vite environment variable. `admin.*` hosts accept administrators only; `operator.*` hosts accept operators and administrators.

Overview, catalogue and recent quote views use real API/database responses. This is the operations foundation, not a complete booking administration system. Production identity, staff roles, CRUD, reservation assignment and payment reconciliation will be added through backend endpoints.

```sh
npm run build
```

The Dockerfile serves the built static app using unprivileged Nginx. Set `VITE_API_BASE_URL` at build time. See [architecture](docs/ARCHITECTURE.md).

## Customer review workflow update

The customer registration, durable reservation request, office approval and demo-payment flows are now implemented. See [the current architecture, API and remaining production work](docs/ARCHITECTURE.md); that document supersedes the initial foundation-only notes above. No cloud deployment or live payment/provider connection is included.
