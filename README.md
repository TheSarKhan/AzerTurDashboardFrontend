# AzerTurDashboardFrontend

Operations dashboard · React / Vite / TypeScript.

```sh
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:5173. The Java backend must run on `VITE_API_BASE_URL`. Sign in with your own email and password. For a fresh local database use the `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` from the backend's local environment, then create personal accounts under Staff (administrators only). The session token is created at sign-in and kept in the browser tab's `sessionStorage`, so a refresh keeps you signed in; it disappears when the tab is closed and is checked with `/api/v1/staff/auth/me` on every load (an expired or revoked token returns you to the sign-in screen). Never place credentials in a Vite environment variable. `admin.*` hosts accept administrators only; `operator.*` hosts accept operators and administrators.

Overview, catalogue and recent quote views use real API/database responses. This is the operations foundation, not a complete booking administration system. Production identity, staff roles, CRUD, reservation assignment and payment reconciliation will be added through backend endpoints.

```sh
npm run build
```

The Dockerfile serves the built static app using unprivileged Nginx. Set `VITE_API_BASE_URL` at build time. See [architecture](docs/ARCHITECTURE.md).

## Customer review workflow update

The customer registration, durable reservation request, offer and contract workflow and finance-recorded payments are now implemented. See [the current architecture, API and remaining production work](docs/ARCHITECTURE.md); that document supersedes the initial foundation-only notes above. No cloud deployment or live payment/provider connection is included.

## Office workflows

The dashboard includes named staff accounts and server-enforced roles, administrator assignment, partner/service catalogue management and partner inventory API keys, received-fund allocation in booking review, revised payment plans, refund tracking and notification delivery monitoring. See [setup, APIs and release boundaries](docs/OFFICE_WORKFLOWS.md). Implementation screenshots are archived in `docs/design/implemented/office-workflows/v1/`; the user-approved request dashboard remains in `docs/design/approved/operations-workspace/v1/`.

## Account security and paid changes

Email verification, password recovery and session revocation now protect customer writes. Paid changes use a separately reviewed proposal and exact PDF acceptance before the effective booking changes. See [setup, workflow and verification](docs/ACCOUNT_SECURITY_AMENDMENTS.md). This work is stacked on `feature/complete-office-workflows`; live delivery still needs the configured server SMTP environment.

## Page addresses

Every page has its own address in the hash, so it can be refreshed, bookmarked, shared and walked back with the browser's back button (see `src/route.ts`):

| Address | Page |
|---|---|
| `#/overview` | Overview |
| `#/requests` | Requests list |
| `#/requests/<id>` | One request |
| `#/requests/<id>/offer` | Offer composer for that request |
| `#/customer-requests` | Customer requests |
| `#/customer-requests/<id>/amendment` | Change proposal |
| `#/customer-requests/<id>/cancellation` | Cancellation review |

Only the open modules have addresses; any other address opens the overview.
