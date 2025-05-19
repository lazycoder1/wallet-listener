wallet-tracker/
├── README.md
├── package.json # root scripts & deps (dev, lint, format, build)
├── bun.toml # root bun config
├── .env.example # global env vars & docs
├── docker-compose.yml # "one-command" local bring-up
├── scripts/ # cross-cutting helper scripts
│ ├── start-all.sh # spins up backend + frontend + db
│ ├── seed-db.ts # quick test data loader
│ └── healthcheck.sh # wrapper around API ping
│
├── backend/ # Node.js / Bun API (Fastify)
│ ├── package.json
│ ├── bun.toml
│ ├── prisma/ # Prisma schema and migrations
│ │ └── schema.prisma
│ │ └── migrations/
│ ├── src/
│ │ ├── index.ts          # Main server setup, plugin registration, starts API & services
│ │ ├── prisma.ts         # Centralized Prisma Client instance
│ │ ├── config.ts         # (Optional) Centralized config loader
│ │ ├── modules/          # HTTP API Feature modules (route-centric)
│ │ │   ├── company/      # Company feature
│ │ │   │   ├── company.routes.ts    # Defines Fastify routes for companies
│ │ │   │   ├── company.service.ts   # Business logic for company CRUD, used by routes
│ │ │   │   ├── company.schema.ts    # (Optional) Zod/JSON schemas for company routes
│ │ │   │   └── company.types.ts     # TypeScript interfaces for company module
│ │ │   ├── import/       # Import feature
│ │ │   │   ├── import.routes.ts
│ │ │   │   ├── import.service.ts    # Business logic for import, used by import routes
│ │ │   │   ├── import.schema.ts
│ │ │   │   └── import.types.ts
│ │ │   └── ... (other API feature modules)
│ │ ├── services/         # Application-level / background services
│ │ │   ├── websocket/      # WebSocket related services
│ │ │   │   ├── wsConnectionManager.ts    # Orchestrates EVM & Tron WebSocket connections, exports shared types
│ │ │   │   ├── evmConnectionManager.ts   # Manages connections to EVM providers (Alchemy/Viem)
│ │ │   │   ├── tronConnectionManager.ts  # Manages connections to Tron providers (TronGrid)
│ │ │   │   ├── wsEventHandler.ts         # Handles incoming messages from managers, processes data
│ │ │   │   └── ws.types.ts               # (Optional but recommended) Centralized types for WebSocket interactions
│ │ │   ├── notification/   # Example: Future service for sending notifications (e.g., Slack)
│ │ │   │   ├── slackNotifier.ts
│ │ │   │   └── notification.types.ts
│ │ │   └── ... (other core/background services)
│ │ └── utils/            # Shared, small, stateless utility functions
│ │     └── validators.ts   # e.g., address validation functions
│ ├── Dockerfile
│ └── .env # Actual environment variables (ensure .env is in .gitignore)
│ └── .env.example # Example environment variables
│
├── frontend/ # Next.js + Tailwind admin panel
│ ├── package.json
│ ├── bun.toml
│ ├── src/
│ │ ├── pages/
│ │ ├── components/
│ │ └── styles/
│ ├── public/
│ ├── Dockerfile
│ └── .env.example
│
└── infra/ # infra as code / provisioning / docs
├── terraform/ # or CloudFormation / Pulumi
├── ansible/ # if you're scripting EC2 setup
└── docs/ # Vercel & EC2 hosting notes
