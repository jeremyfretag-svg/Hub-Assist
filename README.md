# HubAssist

[![CI](https://github.com/Hub-Assist/Hub-Assist/actions/workflows/ci.yml/badge.svg)](https://github.com/Hub-Assist/Hub-Assist/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/Hub-Assist/Hub-Assist/branch/main/graph/badge.svg)](https://codecov.io/gh/Hub-Assist/Hub-Assist)

> A Comprehensive Coworking and Workspace Management System — powered by [Stellar](https://stellar.org)

HubAssist is a full-stack monorepo platform designed to streamline **coworking and workspace management** for hubs, shared offices, and enterprise workspaces. It combines a modern web frontend, a robust REST API backend, and on-chain smart contracts deployed on the **Stellar** blockchain via **Soroban** — enabling trustless payments, membership tokens, and access control.

---

## Table of Contents

1. [About](#about)
2. [Key Features](#key-features)
3. [Tech Stack](#tech-stack)
4. [Monorepo Structure](#monorepo-structure)
5. [Getting Started](#getting-started)
   - [Prerequisites](#prerequisites)
   - [Installation](#installation)
   - [Environment Variables](#environment-variables)
6. [Running the Project](#running-the-project)
7. [Stellar / Soroban Contracts](#stellar--soroban-contracts)
8. [Deployment](#deployment)
   - [Frontend (Vercel)](#frontend-vercel)
   - [Backend](#backend)
   - [Contracts (Stellar Testnet)](#contracts-stellar-testnet)
9. [Environment Variables Reference](#environment-variables-reference)
10. [Contributing](#contributing)
11. [Roadmap](#roadmap)
12. [License](#license)

---

## About

HubAssist handles the everyday operational needs of tech hubs and coworking spaces — from managing members and tracking workspace usage to biometric attendance and on-chain payment escrow. The platform is modular, scalable, and built with real-world enterprise requirements in mind.

This project is built on top of the **Stellar network**, leveraging **Soroban smart contracts** (written in Rust) for:
- Membership token issuance
- Workspace booking with payment escrow
- Role-based access control on-chain

---

## Key Features

- **Biometric Authentication** — Clock-in/clock-out for users and staff via biometric verification.
- **User & Role Management** — Granular account roles and permissions (admin, member, staff).
- **Workspace Tracking** — Real-time monitoring of seat usage, room bookings, and resource allocation.
- **On-Chain Payments** — Stellar-powered payment escrow for workspace bookings.
- **Membership Tokens** — Soroban-based membership NFT/token contracts.
- **Analytics & Logs** — Attendance history, activity logs, and usage reports.
- **Team Collaboration** — Multi-user teams with delegated admin roles.
- **Modular Architecture** — Each package (frontend, backend, contracts) is independently deployable.

---

## Tech Stack

| Layer                  | Technology                              |
|------------------------|-----------------------------------------|
| Frontend               | Next.js 14, React, Tailwind CSS         |
| Backend                | NestJS, Node.js, TypeScript             |
| Database               | PostgreSQL (via TypeORM)                |
| Blockchain / Contracts | Rust, Stellar, Soroban SDK              |
| Auth                   | JWT + Biometric (WebAuthn)              |
| Deployment             | Vercel (frontend), Docker (backend)     |
| CI/CD                  | GitHub Actions                          |

---

## Monorepo Structure

```
hubassist/
├── backend/                  # NestJS REST API
│   └── src/
│       ├── auth/             # JWT auth, biometric login
│       ├── users/            # User management module
│       ├── workspaces/       # Workspace & seat tracking
│       ├── bookings/         # Booking management
│       └── main.ts           # App entry point
│
├── frontend/                 # Next.js 14 App Router
│   ├── app/                  # Pages & layouts
│   ├── components/           # Reusable UI components
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # API clients, utilities
│   └── providers/            # Context providers
│
├── contracts/                # Soroban smart contracts (Rust)
│   ├── hubassist_hub/       # Core hub management contract
│   ├── workspace_booking/    # Booking + payment escrow
│   ├── membership_token/     # Membership token (SRC-20 style)
│   ├── access_control/       # On-chain role management
│   └── common_types/         # Shared Rust types
│
├── .github/
│   └── workflows/            # CI/CD pipelines
├── .gitignore
└── README.md
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18.x
- **npm** or **yarn**
- **PostgreSQL** ≥ 14
- **Rust** toolchain (`rustup`)
- **Stellar CLI** ≥ 23.x

Install Rust:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none
```

Install Stellar CLI:
```bash
# macOS/Linux via Homebrew
brew install stellar-cli

# or via cargo
cargo install --locked stellar-cli@23.1.3
```

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/your-org/hubassist.git
cd hubassist

# 2. Install frontend dependencies
cd frontend && npm install

# 3. Install backend dependencies
cd ../backend && npm install
```

### Environment Variables

```bash
# backend
cp backend/.env.example backend/.env
```

Key variables to configure in `backend/.env`:

| Variable         | Description                          |
|------------------|--------------------------------------|
| `DATABASE_URL`   | PostgreSQL connection string         |
| `JWT_SECRET`     | Secret key for JWT signing           |
| `STELLAR_NETWORK`| `testnet` or `mainnet`               |
| `CONTRACT_ID`    | Deployed Soroban contract address    |
| `FRONTEND_URL`   | Allowed CORS origin (e.g. `https://yourdomain.com`) |

### CORS Configuration

The API uses a strict CORS whitelist. Only the origin set in `FRONTEND_URL` is allowed to make cross-origin requests. Credentials (cookies, Authorization headers) are permitted.

```
FRONTEND_URL=https://yourdomain.com   # production
FRONTEND_URL=http://localhost:3000    # local development
```

Allowed methods: `GET, POST, PUT, PATCH, DELETE, OPTIONS`  
Allowed headers: `Content-Type, Authorization`

Security headers (HSTS, CSP, X-Frame-Options, etc.) are applied via [helmet](https://helmetjs.github.io/). Response compression is enabled via the `compression` middleware.

---

## Running the Project

**Run everything from the root (recommended):**
```bash
# Install all workspace dependencies
npm run install:all

# Start frontend + backend concurrently
npm run dev

# Build both
npm run build

# Lint both
npm run lint

# Test both
npm run test
```

**Or run individually:**

```bash
cd backend && npm run start:dev   # API at http://localhost:3001
cd frontend && npm run dev        # App at http://localhost:3000
```

### Health Check

```
GET /api/health           → { status, timestamp, uptime, database }
GET /api/health/detailed  → DB pool stats, memory, version (admin only)
```

---

## Docker (Local Development)

The entire stack can be started with Docker Compose:

```bash
# Copy and configure environment
cp backend/.env.example backend/.env

# Start all services (postgres + backend + frontend)
docker compose up
```

`docker-compose.override.yml` is applied automatically in development — it mounts source directories into the containers for hot-reload.

| Service    | URL                        |
|------------|----------------------------|
| Frontend   | http://localhost:3000       |
| Backend    | http://localhost:3001       |
| PostgreSQL | localhost:5432              |

To run only the database (e.g. for local `npm run start:dev`):
```bash
docker compose up postgres
```

---

## Stellar / Soroban Contracts

All smart contracts live in the `contracts/` directory and are written in **Rust** targeting the **Soroban** runtime on Stellar.

### Build a contract
```bash
cd contracts/workspace_booking
stellar contract build
# Output: target/wasm32v1-none/release/workspace_booking.wasm
```

### Run tests
```bash
cd contracts/workspace_booking
cargo test
```

### Deploy to testnet
```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/workspace_booking.wasm \
  --source-account <your-account> \
  --network testnet \
  --alias workspace_booking
```

### Contracts Overview

| Contract             | Description                                      |
|----------------------|--------------------------------------------------|
| `hubassist_hub`     | Core hub registry and member management          |
| `workspace_booking`  | Booking creation, cancellation, payment escrow   |
| `membership_token`   | Tokenized membership with expiry and tiers       |
| `access_control`     | On-chain role assignment and permission checks   |
| `common_types`       | Shared enums, structs, and error types           |

---

## Deployment

### Frontend (Vercel)

The frontend is deployed to [Vercel](https://vercel.com). The repository ships with a `frontend/vercel.json` that pins the Next.js framework, build command, and security headers.

#### Connect the repository

1. From the Vercel dashboard, click **Add New → Project** and import the `Hub-Assist/Hub-Assist` GitHub repo.
2. When prompted for the **Root Directory**, choose `frontend`.
3. Vercel auto-detects Next.js. Keep the default **Build Command** (`next build`) and **Output Directory** (`.next`).

#### Configure environment variables

Set the following project environment variables in **Vercel → Project → Settings → Environment Variables** (apply to Production, Preview, and Development scopes as appropriate):

| Variable | Example (Production) | Notes |
|----------|----------------------|-------|
| `NEXT_PUBLIC_API_URL` | `https://api.hubassist.com/api` | Public URL of the backend API. Must include the `/api` suffix. |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `mainnet` | `testnet` for preview deployments. |
| `NEXT_PUBLIC_APP_URL` | `https://hubassist.com` | Canonical public URL used in metadata and OG tags. |

`frontend/.env.production` documents these variables but contains no real secrets.

#### Custom domain

1. In **Vercel → Project → Settings → Domains**, add your domain (e.g. `hubassist.com`).
2. Add the suggested `A` / `CNAME` records at your DNS provider.
3. Wait for Vercel to issue a TLS certificate (typically under a minute).
4. Update `NEXT_PUBLIC_APP_URL` to the new domain and trigger a redeploy.

#### Deploy from the CLI

```bash
# Preview deployment
npm run deploy:frontend:preview

# Production deployment
npm run deploy:frontend
```

Both commands shell out to the [Vercel CLI](https://vercel.com/docs/cli); run `vercel login` once before first use.

### Backend

The backend is deployed via Docker (or any Node.js host that can run `npm run start:prod`). Ensure all variables listed in [Environment Variables Reference](#environment-variables-reference) are configured in the target environment.

### Contracts (Stellar Testnet)

Contracts can be deployed manually via `contracts/scripts/deploy.sh`, or automatically via the **Deploy Contracts** GitHub Actions workflow (`.github/workflows/deploy-contracts.yml`). The workflow can be triggered manually from the Actions tab and writes deployed contract IDs to `contracts/.env.testnet`.

Required GitHub Actions secret:

- `STELLAR_SECRET_KEY` — Stellar account secret key (starts with `S…`) used to fund deployment. Add it under **GitHub → Settings → Secrets and variables → Actions → New repository secret**.

---

## Environment Variables Reference

### Backend (`backend/.env`)

#### Database
| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `DATABASE_URL` | string | yes | — | PostgreSQL connection string. |

#### JWT / Auth
| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `JWT_SECRET` | string | yes | — | Secret used to sign access tokens. |
| `JWT_EXPIRES_IN` | string | no | `1h` | Access token TTL (e.g. `15m`, `1h`). |
| `REFRESH_TOKEN_SECRET` | string | yes | — | Secret used to sign refresh tokens. |
| `REFRESH_TOKEN_EXPIRES_IN` | string | no | `7d` | Refresh token TTL. |

#### Email (SMTP)
| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `SMTP_HOST` | string | no | — | SMTP server hostname. |
| `SMTP_PORT` | number | no | — | SMTP server port (often 587 or 465). |
| `SMTP_USER` | string | no | — | SMTP username. |
| `SMTP_PASSWORD` | string | no | — | SMTP password or app password. |
| `EMAIL_FROM` | string | no | — | Default "From" address for outbound mail. |

#### Cloudinary (file uploads)
| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `CLOUDINARY_CLOUD_NAME` | string | no | — | Cloudinary cloud name. |
| `CLOUDINARY_API_KEY` | string | no | — | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | string | no | — | Cloudinary API secret. |

#### Stellar / Contracts
| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `STELLAR_NETWORK` | enum | no | `testnet` | `testnet` or `mainnet`. |
| `WORKSPACE_BOOKING_CONTRACT_ID` | string | no | — | Deployed `workspace_booking` contract ID. |
| `MEMBERSHIP_TOKEN_CONTRACT_ID` | string | no | — | Deployed `membership_token` contract ID. |

#### App
| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `NODE_ENV` | enum | no | `development` | `development`, `production`, or `test`. |
| `FRONTEND_URL` | string | no | `http://localhost:3000` | Allowed CORS origin. |

### Frontend (`frontend/.env.local`)

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | string | yes | `http://localhost:3001/api` | Public URL of the backend API, including the `/api` suffix. |
| `NEXT_PUBLIC_STELLAR_NETWORK` | enum | no | `testnet` | `testnet` or `mainnet`. |
| `NEXT_PUBLIC_APP_URL` | string | no | `http://localhost:3000` | Canonical public URL of the app. |

To validate the backend env config without booting the app, run:

```bash
npm run validate-env
```

This runs `backend/scripts/validate-env.js`, which loads `backend/.env` and checks it against the Joi schema in `backend/src/config/validation.schema.ts`.

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide covering local setup, branch naming, [Conventional Commits](https://www.conventionalcommits.org/), and the pull request process.

Quick start:

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes following Conventional Commits (`feat: ...`, `fix: ...`, etc.)
4. Push and open a Pull Request — the PR template will populate automatically

---

## Roadmap

- [ ] Mobile app (React Native)
- [ ] Biometric hardware integration (fingerprint scanners)
- [ ] Multi-hub support (franchise/chain management)
- [ ] Stellar Anchor integration for fiat on/off ramp
- [ ] Advanced analytics dashboard
- [ ] Webhook support for third-party integrations

---

## License

MIT © HubAssist Contributors
