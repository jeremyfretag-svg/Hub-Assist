# HubAssist Backend

NestJS REST API for the HubAssist coworking and workspace management platform.

## Running

```bash
cp .env.example .env   # configure environment variables
npm install
npm run start:dev      # http://localhost:3001
```

Swagger UI: `http://localhost:3001/api/docs`

## API Versioning

All routes are versioned under `/api/v1/`. The versioning strategy is URI-based (`VersioningType.URI`). Future breaking changes will be introduced under `/api/v2/` while v1 remains supported.

| Version | Base URL      | Status  |
|---------|---------------|---------|
| v1      | `/api/v1/...` | Current |

## Database Seeding

Populate the database with development seed data:

```bash
npm run seed
```

The seeder is **idempotent** — it checks for existing records before inserting and skips any table that already has data. Running it multiple times is safe.

### Seed data created

| Entity                  | Count | Details                                      |
|-------------------------|-------|----------------------------------------------|
| Users                   | 9     | 1 admin, 5 members, 3 staff                  |
| Workspaces              | 4     | Hot Desk, Dedicated Desk, Private Office, Boardroom |
| Bookings                | 10    | Mix of Pending, Confirmed, Cancelled, Completed |
| Newsletter subscribers  | 5     | 3 confirmed, 2 unconfirmed                   |
| Contact messages        | 3     | Various subjects                             |

### Seed credentials

| Role   | Email                  | Password     |
|--------|------------------------|--------------|
| Admin  | admin@hubassist.dev    | Admin@123    |
| Member | alice@hubassist.dev    | Member@123   |
| Staff  | frank@hubassist.dev    | Staff@123    |

> **Note:** Seed data is for local development only. Never run the seeder against a production database.

## Environment Variables

| Variable              | Description                                      |
|-----------------------|--------------------------------------------------|
| `DATABASE_URL`        | PostgreSQL connection string                     |
| `JWT_SECRET`          | Secret key for JWT signing                       |
| `JWT_EXPIRES_IN`      | Access token TTL (e.g. `1h`)                     |
| `REFRESH_TOKEN_SECRET`| Secret for refresh token signing                 |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh token TTL (e.g. `7d`)               |
| `SMTP_HOST`           | SMTP server host                                 |
| `SMTP_PORT`           | SMTP server port                                 |
| `SMTP_USER`           | SMTP username                                    |
| `SMTP_PASSWORD`       | SMTP password / app password                     |
| `EMAIL_FROM`          | Sender address for outgoing emails               |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name                          |
| `CLOUDINARY_API_KEY`  | Cloudinary API key                               |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret                          |
| `STELLAR_NETWORK`     | `testnet` or `mainnet`                           |
| `CONTRACT_ID`         | Deployed Soroban contract address                |
| `FRONTEND_URL`        | Allowed CORS origin                              |
| `NODE_ENV`            | `development`, `test`, or `production`           |

## Scripts

| Script            | Description                          |
|-------------------|--------------------------------------|
| `npm run start:dev` | Start in watch mode                |
| `npm run build`   | Compile TypeScript                   |
| `npm run test`    | Run unit tests                       |
| `npm run test:e2e`| Run end-to-end tests                 |
| `npm run seed`    | Seed the development database        |
| `npm run lint`    | Lint and auto-fix                    |

## Modules

| Module       | Path                    | Description                              |
|--------------|-------------------------|------------------------------------------|
| auth         | `src/auth/`             | JWT auth, OTP, biometric (WebAuthn)      |
| users        | `src/users/`            | User management and profile              |
| workspaces   | `src/workspaces/`       | Workspace CRUD and availability          |
| bookings     | `src/bookings/`         | Booking lifecycle and payment            |
| attendance   | `src/attendance/`       | Clock-in / clock-out tracking            |
| newsletter   | `src/newsletter/`       | Subscription management                  |
| contact      | `src/contact/`          | Contact form submissions                 |
| dashboard    | `src/dashboard/`        | Aggregated stats and activity            |
| stellar      | `src/stellar/`          | Soroban contract interaction             |
| email        | `src/email/`            | Transactional email via Nodemailer       |
| cloudinary   | `src/cloudinary/`       | Image upload and storage                 |
