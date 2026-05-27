# HubAssist

> A Comprehensive Coworking and Workspace Management System — powered by [Stellar](https://stellar.org)

[![CI](https://github.com/Hub-Assist/Hub-Assist/actions/workflows/ci.yml/badge.svg)](https://github.com/Hub-Assist/Hub-Assist/actions/workflows/ci.yml)

HubAssist is a full-stack monorepo platform designed to streamline **coworking and workspace management** for hubs, shared offices, and enterprise workspaces. It combines a modern web frontend, a robust REST API backend, and on-chain smart contracts deployed on the **Stellar** blockchain via **Soroban** — enabling trustless payments, membership tokens, and access control.

---

## Table of Contents

1. [Key Features](#key-features)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Monorepo Structure](#monorepo-structure)
5. [Getting Started](#getting-started)
6. [Running the Project](#running-the-project)
7. [API Reference](#api-reference)
8. [Contract Architecture](#contract-architecture)
9. [Deployment](#deployment)
10. [Contributing](#contributing)
11. [Roadmap](#roadmap)
12. [License](#license)

---

## Key Features

- **Biometric Authentication** — Clock-in/clock-out via WebAuthn biometric verification.
- **User & Role Management** — Granular roles: admin, member, staff.
- **Workspace Tracking** — Real-time seat usage, room bookings, and resource allocation.
- **On-Chain Payments** — Stellar-powered payment escrow for workspace bookings.
- **Membership Tokens** — Soroban-based membership token contracts.
- **Analytics & Dashboard** — Attendance history, activity logs, and usage reports.
- **Newsletter & Contact** — Subscriber management and contact form handling.
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

## Architecture

```
┌─────────────────────┐        ┌──────────────────────────┐
│   Next.js Frontend  │──────▶│   NestJS REST API         │
│   (Vercel)          │  HTTP  │   /api/v1/...             │
│                     │◀──────│   (Docker / Node)         │
└─────────────────────┘        └────────────┬─────────────┘
                                             │
                              ┌──────────────▼─────────────┐
                              │   PostgreSQL Database       │
                              │   (TypeORM entities)        │
                              └──────────────┬─────────────┘
                                             │
                              ┌──────────────▼─────────────┐
                              │   Stellar / Soroban         │
                              │   Smart Contracts (Rust)    │
                              └────────────────────────────┘
```

The frontend communicates exclusively with the backend REST API. The backend interacts with PostgreSQL for persistence and with Soroban smart contracts on the Stellar network for on-chain operations (payment escrow, membership tokens, access control).

---

## Monorepo Structure

```
hubassist/
├── backend/                  # NestJS REST API
│   └── src/
│       ├── auth/             # JWT auth, OTP, biometric (WebAuthn)
│       ├── users/            # User management and profiles
│       ├── workspaces/       # Workspace CRUD and availability
│       ├── bookings/         # Booking lifecycle and payment
│       ├── attendance/       # Clock-in / clock-out tracking
│       ├── newsletter/       # Subscription management
│       ├── contact/          # Contact form submissions
│       ├── dashboard/        # Aggregated stats and activity
│       ├── stellar/          # Soroban contract interaction
│       ├── email/            # Transactional email (Nodemailer)
│       ├── cloudinary/       # Image upload and storage
│       ├── common/           # Guards, pipes, decorators, pagination
│       ├── config/           # App and database configuration
│       ├── database/
│       │   └── seeds/        # Development seed scripts
│       └── main.ts           # App entry point
│
├── frontend/                 # Next.js 14 App Router
│   ├── src/
│   │   ├── app/              # Pages & layouts (App Router)
│   │   ├── components/       # Reusable UI components
│   │   │   ├── auth/
│   │   │   ├── bookings/
│   │   │   ├── dashboard/
│   │   │   ├── attendance/
│   │   │   ├── workspaces/
│   │   │   ├── landing/
│   │   │   └── ui/
│   │   ├── hooks/            # Custom React hooks
│   │   ├── lib/              # API client, store, react-query, schemas
│   │   ├── providers/        # Context providers
│   │   ├── types/            # TypeScript type definitions
│   │   └── utils/            # Utility functions
│   └── __tests__/            # Frontend unit tests
│
├── contracts/                # Soroban smart contracts (Rust)
│   ├── hubassist_hub/        # Core hub registry
│   ├── manage_hub/           # Hub management (tiers, staking, rewards)
│   ├── workspace_booking/    # Booking + payment escrow
│   ├── membership_token/     # Membership token (SRC-20 style)
│   ├── access_control/       # On-chain role management
│   ├── payment_escrow/       # Payment escrow logic
│   ├── common_types/         # Shared Rust types
│   └── scripts/              # Deploy and initialize scripts
│
├── .github/
│   └── workflows/            # CI/CD pipelines
└── README.md
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18.x
- **npm** ≥ 9.x
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
cargo install --locked stellar-cli@23.1.3
```

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/Hub-Assist/Hub-Assist.git
cd Hub-Assist

# 2. Install backend dependencies
cd backend && npm install

# 3. Install frontend dependencies
cd ../frontend && npm install
```

### Environment Variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Key backend variables:

| Variable         | Description                          |
|------------------|--------------------------------------|
| `DATABASE_URL`   | PostgreSQL connection string         |
| `JWT_SECRET`     | Secret key for JWT signing           |
| `STELLAR_NETWORK`| `testnet` or `mainnet`               |
| `CONTRACT_ID`    | Deployed Soroban contract address    |
| `FRONTEND_URL`   | Allowed CORS origin                  |

Key frontend variables:

| Variable               | Description                    |
|------------------------|--------------------------------|
| `NEXT_PUBLIC_API_URL`  | Backend API base URL (with `/v1`) |

### Seed Development Data

After the database is running:

```bash
cd backend
npm run seed
```

This creates 1 admin, 5 members, 3 staff, 4 workspaces, 10 bookings, 5 newsletter subscribers, and 3 contact messages. The seeder is idempotent — safe to run multiple times. See [backend/README.md](./backend/README.md) for seed credentials.

---

## Running the Project

**Backend (NestJS):**
```bash
cd backend
npm run start:dev
# API available at http://localhost:3001
# Swagger UI at http://localhost:3001/api/docs
```

**Frontend (Next.js):**
```bash
cd frontend
npm run dev
# App available at http://localhost:3000
```

---

## API Reference

The REST API is versioned under `/api/v1/`. Interactive documentation is available via Swagger UI at:

```
http://localhost:3001/api/docs
```

### Versioning Strategy

URI versioning is used (`/api/v1/`, `/api/v2/`, ...). The current version is **v1**. All controllers declare `version: '1'` explicitly. Future breaking changes will be introduced in a new version while v1 remains supported.

### Endpoints Summary

| Tag         | Base path            | Description                        |
|-------------|----------------------|------------------------------------|
| auth        | `/api/v1/auth`       | Register, login, OTP, refresh      |
| biometric   | `/api/v1/auth/biometric` | WebAuthn registration & login  |
| users       | `/api/v1/users`      | User management                    |
| workspaces  | `/api/v1/workspaces` | Workspace CRUD                     |
| bookings    | `/api/v1/bookings`   | Booking lifecycle                  |
| attendance  | `/api/v1/attendance` | Clock-in / clock-out               |
| newsletter  | `/api/v1/newsletter` | Subscription management            |
| contact     | `/api/v1/contact`    | Contact form                       |
| dashboard   | `/api/v1/dashboard`  | Stats and activity                 |

---

## Contract Architecture

All smart contracts live in `contracts/` and are written in **Rust** targeting the **Soroban** runtime on Stellar.

| Contract             | Description                                                  |
|----------------------|--------------------------------------------------------------|
| `hubassist_hub`      | Core hub registry — stores hub metadata and member list      |
| `manage_hub`         | Hub management — tiers, staking, rewards, attendance logging |
| `workspace_booking`  | Booking creation, cancellation, and payment escrow           |
| `membership_token`   | Tokenized membership with expiry and tier support            |
| `access_control`     | On-chain role assignment and permission checks               |
| `payment_escrow`     | Holds funds until booking conditions are met                 |
| `common_types`       | Shared enums, structs, and error types                       |

### Contract Interactions

```
hubassist_hub ──▶ access_control   (role checks)
workspace_booking ──▶ payment_escrow  (hold/release funds)
manage_hub ──▶ membership_token    (issue/revoke tokens)
manage_hub ──▶ attendance_log      (on-chain clock-in/out)
```

### Build & Deploy

```bash
# Build a contract
cd contracts/workspace_booking
stellar contract build

# Run tests
cargo test

# Deploy to testnet
stellar contract deploy \
  --wasm target/wasm32v1-none/release/workspace_booking.wasm \
  --source-account <your-account> \
  --network testnet \
  --alias workspace_booking
```

---

## Deployment

### Frontend — Vercel

1. Connect the repository to [Vercel](https://vercel.com).
2. Set the root directory to `frontend`.
3. Add environment variable: `NEXT_PUBLIC_API_URL=https://your-api-domain.com/api/v1`.
4. Deploy.

### Backend — Docker

A `Dockerfile` can be added to `backend/`. The recommended approach:

```bash
# Build
docker build -t hubassist-backend ./backend

# Run
docker run -p 3001:3001 --env-file backend/.env hubassist-backend
```

For production, use a managed PostgreSQL service (e.g. AWS RDS, Supabase) and set `NODE_ENV=production` to disable `synchronize` on TypeORM.

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Commit your changes with clear messages.
4. Push and open a Pull Request against `main`.

Please follow the existing code style and architecture patterns in each package. See [CONTRIBUTING.md](./CONTRIBUTING.md) if present.

---

## Roadmap

- [ ] Mobile app (React Native)
- [ ] Biometric hardware integration (fingerprint scanners)
- [ ] Multi-hub support (franchise/chain management)
- [ ] Stellar Anchor integration for fiat on/off ramp
- [ ] Advanced analytics dashboard
- [ ] Webhook support for third-party integrations
- [ ] Docker Compose setup for local development

---

## License

MIT © HubAssist Contributors
