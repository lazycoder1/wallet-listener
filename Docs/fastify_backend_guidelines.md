# Fastify Backend Guidelines

This document outlines design principles, conventions, and best practices for developing the Fastify backend for the Wallet Watcher project. Adhering to these guidelines will help maintain a consistent, scalable, and maintainable codebase using Node.js/TypeScript with Bun.

## 1. API Design Principles

### 1.1. RESTful Conventions
- **Resource-Oriented:** Design APIs around resources (e.g., `companies`, `addresses`, `transactions`).
- **HTTP Methods:** Use HTTP methods appropriately:
    - `GET`: Retrieve resources. Idempotent.
    - `POST`: Create new resources. Not idempotent.
    - `PUT`: Update/replace an existing resource completely. Idempotent.
    - `PATCH`: Partially update an existing resource. Not idempotent generally, but can be designed to be.
    - `DELETE`: Remove a resource. Idempotent.
- **Statelessness:** Each request from a client to the server must contain all the information needed to understand the request. Do not rely on server-side sessions for API state (Fastify is well-suited for this).

### 1.2. URL Naming Conventions
- **Plural Nouns:** Use plural nouns for resource collections (e.g., `/companies`, `/alerts`).
- **Identifiers in Path:** Use path parameters for specific resource identifiers (e.g., `/companies/:companyId`, `/addresses/:addressId`). Fastify uses the colon prefix for parameters.
- **Lowercase & Hyphens:** Use lowercase letters and hyphens (`-`) to separate words in URIs (kebab-case). Avoid underscores (`_`) or camelCase.
    - Example: `/slack-configurations/:configId/link-company`
- **No Trailing Slashes:** Generally avoid trailing slashes. Fastify can be configured to handle this, but consistency is key.

### 1.3. Request & Response Payloads
- **JSON:** Use JSON for all request and response bodies by default. Fastify handles JSON parsing and serialization efficiently.
- **Schema Validation:** Use Fastify's built-in support for JSON Schema validation for request bodies, query parameters, path parameters, and response serialization. Define schemas for all routes.
    - This provides validation, serialization, and contributes to Swagger/OpenAPI documentation.
- **Standardized Success Response:**
    ```json
    {
        "success": true,
        "data": { /* requested data or result of operation */ },
        "message": "Operation successful" // Optional success message
    }
    ```
    For list responses, consider pagination metadata if applicable:
    ```json
    {
        "success": true,
        "data": [ /* list of items */ ],
        "pagination": {
            "page": 1,
            "perPage": 20,
            "totalItems": 100,
            "totalPages": 5
        }
    }
    ```
- **Standardized Error Response:** (See Error Handling section for more details)
    ```json
    {
        "success": false,
        "error": {
            "code": "ERROR_CODE_SLUG",
            "message": "A human-readable error message.",
            "details": { /* optional field for more specific error details or validation errors */ }
        }
    }
    ```
- **HTTP Status Codes:** Use appropriate HTTP status codes (same as listed in previous FastAPI guidelines, e.g., 200, 201, 204, 400, 401, 403, 404, 409, 500, 503). Fastify makes it easy to set these (`reply.code(200)`).

### 1.4. Authentication & Authorization
- **Token-Based Authentication:** Use token-based authentication (e.g., JWT). Fastify plugins like `@fastify/jwt` can be used.
- **Hooks for Security:** Utilize Fastify's hooks (`onRequest`, `preValidation`, `preHandler`) for implementing authentication and authorization checks.
- **Granular Permissions:** Design authorization logic based on user roles or company associations, checkable within hooks or service layers.

### 1.5. API Versioning
- **URL Path Versioning:** If/when API breaking changes are necessary, use URL path versioning.
    - Example: `/api/v1/companies`, `/api/v2/companies`
- **Fastify Plugins/Prefixes:** Structure versions using separate Fastify plugins registered with a version prefix.

## 2. Core Libraries & Technologies

- **Web Framework:** **Fastify** - For building high-performance, low-overhead web applications with Node.js/TypeScript.
- **Runtime:** **Bun** - Using Bun as the JavaScript runtime, package manager, and bundler.
- **Language:** **TypeScript** - For type safety and improved developer experience.
- **Data Validation & Serialization:** **JSON Schema** with Fastify's built-in validation.
- **ORM:** **Prisma Client JS/TS** - For database interactions with the PostgreSQL database.
- **EVM Interactions:**
    - **`viem`**: (As you mentioned) A modern TypeScript library for EVM interactions.
    - **`ethers.js`**: Another widely used alternative.
- **Tron Interactions:**
    - **`tronweb`**: (As you mentioned) A JavaScript library for Tron.
- **Asynchronous Operations:** Leverage Node.js's `async` and `await` with Promises. Fastify handlers are typically async.
- **HTTP Client:** **`axios`** or **`node-fetch`** (or Bun's built-in `fetch`) - For making requests to external services (e.g., Slack API).
- **Configuration Management:** Use environment variables (e.g., via `.env` files loaded by `dotenv` or Bun's native support) and a dedicated config module.

## 3. Error Handling

- **Fastify Error Handling:** Utilize Fastify's `setErrorHandler` to create a global error handler for standardized error responses.
- **Custom Error Classes:** Define custom error classes (e.g., `NotFoundError`, `AuthenticationError`, `ValidationError`) that can be caught by the global error handler.
- **Standardized Error Response Format:** (As shown in section 1.3)
- **Logging Errors:** Ensure all unhandled exceptions and significant handled errors are logged (see Logging section).

## 4. Logging

- **Fastify Logging:** Fastify has built-in Pino-based logging, which is highly performant and provides structured JSON logging by default.
- **Configuration:** Configure Fastify's logger options (log level, pretty print for development, redaction of sensitive paths).
    ```typescript
    // Example Fastify logger setup
    const fastify = Fastify({
      logger: {
        level: process.env.LOG_LEVEL || 'info',
        transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
        redact: ['req.headers.authorization', 'req.body.password'] // Redact sensitive info
      }
    });
    ```
- **Key Information to Log:** Standard Fastify logs often include request ID, method, path, response time. Augment with application-specific context where needed.
- **Sensitive Data:** Be cautious. Use Pino's redaction features or manual scrubbing for sensitive data.

## 5. Code Quality & Maintainability

### 5.1. File & Module Structure (Typical for Node.js/Fastify)
- **Logical Grouping:** (e.g., `src/routes/`, `src/services/` or `src/modules/<feature>/`, `src/lib/`, `src/plugins/`, `src/config/`).
- **Routes:** Define routes in separate files (e.g., `src/routes/companyRoutes.ts`, `src/routes/slackRoutes.ts`) and register them as Fastify plugins.
- **Services/Controllers:** Encapsulate business logic in service classes/modules. Route handlers should be lean and delegate to services.
- **Schemas:** JSON schemas for validation can be co-located with routes or in a separate `schemas/` directory.

### 5.2. File Length
- **Suggested Maximum:** Aim for **200-400 lines of code (LOC)** per file/module. This is a guideline.
- **Rationale:** Promotes better organization and readability in a Node.js/TypeScript context.

### 5.3. Refactoring Guidelines
- (Similar to previous guidelines: Rule of Three, complex conditionals, large functions, tight coupling, readability, testing, DRY, SOLID if using classes extensively).

### 5.4. TypeScript Usage
- **Strict Mode:** Enable strict mode in `tsconfig.json`.
- **Type Definitions:** Use types/interfaces for all data structures, function signatures, and service contracts.
- **Avoid `any`:** Minimize the use of `any` where possible.

### 5.5. Code Formatting & Linting
- **Formatter:** Use **Prettier**.
- **Linter:** Use **ESLint** with appropriate plugins (e.g., `@typescript-eslint/eslint-plugin`).
- **Pre-commit Hooks:** Use Husky and lint-staged to enforce formatting and linting before commits.

---

This document serves as a starting point. It should be reviewed and updated periodically as the project evolves. 