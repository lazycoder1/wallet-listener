# FastAPI Backend Guidelines

This document outlines design principles, conventions, and best practices for developing the FastAPI backend for the Wallet Watcher project. Adhering to these guidelines will help maintain a consistent, scalable, and maintainable codebase.

## 1. API Design Principles

### 1.1. RESTful Conventions
- **Resource-Oriented:** Design APIs around resources (e.g., `companies`, `addresses`, `transactions`).
- **HTTP Methods:** Use HTTP methods appropriately:
    - `GET`: Retrieve resources. Idempotent.
    - `POST`: Create new resources. Not idempotent.
    - `PUT`: Update/replace an existing resource completely. Idempotent.
    - `PATCH`: Partially update an existing resource. Not idempotent generally, but can be designed to be.
    - `DELETE`: Remove a resource. Idempotent.
- **Statelessness:** Each request from a client to the server must contain all the information needed to understand the request. Do not rely on server-side sessions for API state.

### 1.2. URL Naming Conventions
- **Plural Nouns:** Use plural nouns for resource collections (e.g., `/companies`, `/alerts`).
- **Identifiers in Path:** Use path parameters for specific resource identifiers (e.g., `/companies/{company_id}`, `/addresses/{address_id}`).
- **Lowercase & Hyphens:** Use lowercase letters and hyphens (`-`) to separate words in URIs (kebab-case). Avoid underscores (`_`) or camelCase.
    - Example: `/slack-configurations/{config_id}/link-company`
- **No Trailing Slashes:** Do not use trailing slashes in URIs. FastAPI handles this well by default.

### 1.3. Request & Response Payloads
- **JSON:** Use JSON for all request and response bodies.
- **Pydantic Models:** Define clear Pydantic models for all request and response bodies to ensure validation, serialization, and clear contracts (leveraging FastAPI's automatic request/response validation and documentation).
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
            "per_page": 20,
            "total_items": 100,
            "total_pages": 5
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
- **HTTP Status Codes:** Use appropriate HTTP status codes:
    - `200 OK`: General success for `GET`, `PUT`, `PATCH`.
    - `201 Created`: Resource successfully created (`POST`).
    - `204 No Content`: Successful request with no body to return (e.g., `DELETE`).
    - `400 Bad Request`: Client-side error (e.g., invalid JSON, validation error).
    - `401 Unauthorized`: Authentication required and failed or has not yet been provided.
    - `403 Forbidden`: Authenticated user does not have permission to access the resource.
    - `404 Not Found`: Resource not found.
    - `409 Conflict`: Request conflicts with the current state of the server (e.g., duplicate entry).
    - `422 Unprocessable Entity`: Request was well-formed but contains semantic errors (often used by FastAPI for Pydantic validation errors).
    - `500 Internal Server Error`: Generic server-side error.
    - `503 Service Unavailable`: Server is temporarily unable to handle the request (e.g., downstream service issue).

### 1.4. Authentication & Authorization
- **Token-Based Authentication:** Use token-based authentication (e.g., JWT, OAuth2 Bearer tokens) for securing endpoints. FastAPI provides tools for OAuth2 integration.
- **Dependencies for Security:** Utilize FastAPI's dependency injection system to handle authentication and authorization checks per endpoint or router.
    - Example: `Depends(get_current_active_user)`
- **Granular Permissions:** Design authorization logic to be granular based on user roles or company associations.

### 1.5. API Versioning
- **URL Path Versioning:** If/when API breaking changes are necessary, consider versioning via the URL path.
    - Example: `/v1/companies`, `/v2/companies`
- **Strive for Backward Compatibility:** Aim to make non-breaking changes where possible to avoid frequent versioning.

## 2. Core Libraries & Technologies

- **Web Framework:** **FastAPI** - For building robust and performant APIs with Python type hints.
- **Data Validation & Serialization:** **Pydantic** - Used extensively with FastAPI for request/response models, data validation, and settings management.
- **ORM:** **Prisma Client Python** - For database interactions with the PostgreSQL database.
- **EVM Interactions:**
    - **`web3.py`**: The primary library for interacting with Ethereum-compatible blockchains (EVMs).
    - Consider using Python wrappers or direct RPC calls if specific `viem` functionalities are heavily relied upon and a direct Python port isn't available.
- **Tron Interactions:**
    - **`tronpy`**: A Python library for interacting with the Tron network.
    - Alternatively, other maintained Python SDKs for Tron can be evaluated.
- **Asynchronous Operations:** Leverage Python's `async` and `await` keywords with FastAPI for non-blocking I/O operations, crucial for interacting with external APIs and blockchain nodes.
- **HTTP Client:** **`httpx`** - An async-capable HTTP client, recommended for making requests to external services (like Slack API, blockchain RPCs if not covered by dedicated libraries).

## 3. Error Handling

- **Custom Exception Handlers:** Implement custom exception handlers using FastAPI's `@app.exception_handler()` decorator to catch specific custom exceptions or common library exceptions (e.g., Prisma errors, `web3.py` errors) and return standardized JSON error responses.
- **Standardized Error Response Format:** (As shown in section 1.3)
    ```json
    {
        "success": false,
        "error": {
            "code": "ERROR_CODE_SLUG", // e.g., "VALIDATION_ERROR", "RESOURCE_NOT_FOUND", "SLACK_API_ERROR"
            "message": "A human-readable error message.",
            "details": { /* optional: for validation errors, this could be a dict of field-specific messages */ }
        }
    }
    ```
- **Validation Errors:** FastAPI automatically handles Pydantic validation errors and returns a `422 Unprocessable Entity` status. Customize the response format if needed via a custom exception handler for `RequestValidationError`.
- **Logging Errors:** Ensure all unhandled exceptions and significant handled errors are logged with sufficient context (see Logging section).

## 4. Logging

- **Structured Logging:** Implement structured logging (e.g., JSON format) to make logs easily parsable and searchable, especially in production. Libraries like `structlog` can be integrated.
- **Standard Python `logging` Module:** Configure and use Python's built-in `logging` module. FastAPI integrates well with it.
- **Configuration:**
    - Configure log levels (DEBUG, INFO, WARNING, ERROR, CRITICAL) appropriately for different environments.
    - Output logs to `stdout`/`stderr` for containerized environments and/or to files as needed.
- **Key Information to Log:**
    - Timestamp
    - Log level
    - Service/module name
    - Correlation ID (if implementing distributed tracing)
    - Request details (method, path, client IP) for API request logs
    - User ID / Company ID (if available and relevant, being mindful of PII)
    - Error messages and stack traces for exceptions
    - Key business events or state changes.
- **Sensitive Data:** Be cautious not to log sensitive information (passwords, API keys, raw private keys).

## 5. Code Quality & Maintainability

### 5.1. File & Module Structure
- **Logical Grouping:** Group related functionality into modules/packages (e.g., `routers/`, `services/`, `models/`, `core/`).
- **Routers:** Define API routes in separate router files (e.g., `routers/company_router.py`, `routers/slack_router.py`) and include them in the main `app.py` or `main.py`.
- **Services:** Encapsulate business logic within service classes/modules. Routers should primarily handle HTTP request/response marshalling and call service methods.
- **Models:** Pydantic models for request/response data should be clearly defined, potentially in a `schemas.py` or `models.py` within relevant modules.

### 5.2. File Length
- **Suggested Maximum:** Aim to keep Python files under **300-500 lines of code (LOC)**. This is a guideline, not a strict rule.
- **Rationale:** Shorter files are generally easier to understand, test, and maintain.
- **When to Split:**
    - If a file contains multiple distinct responsibilities.
    - If a class or module becomes overly complex.
    - If the file is difficult to navigate or comprehend quickly.

### 5.3. Refactoring Guidelines
- **"Rule of Three":** If you find yourself writing similar code for the third time, consider refactoring it into a reusable function, class, or utility.
- **Complex Conditionals/Loops:** If a function contains deeply nested or very complex conditional logic or loops, it might be a candidate for simplification or breaking down into smaller functions.
- **Large Functions/Methods:** Functions or methods exceeding 50-75 LOC should be reviewed. Can they be broken down into smaller, more focused units?
- **Tight Coupling:** If modules or classes are excessively dependent on each other's internal details, look for opportunities to decouple them (e.g., through interfaces, dependency injection, event-driven patterns).
- **Readability:** Prioritize clear and readable code. Use meaningful variable and function names. Add comments for complex or non-obvious logic.
- **Testing:** Ensure refactoring efforts are covered by tests to prevent regressions. Write tests *before* major refactoring if coverage is lacking.
- **DRY (Don't Repeat Yourself):** Avoid code duplication.
- **SOLID Principles:** Keep SOLID principles in mind for object-oriented design if applicable.

### 5.4. Type Hinting
- **Mandatory:** Use Python type hints for all function signatures (arguments and return types) and variable declarations where appropriate. FastAPI leverages these extensively.

### 5.5. Code Formatting & Linting
- **Formatter:** Use a consistent code formatter like **Black**.
- **Linter:** Use a linter like **Flake8** (with plugins like `flake8-bugbear`, `flake8-comprehensions`) or **Ruff** (which can also format).
- **Pre-commit Hooks:** Consider using pre-commit hooks to automatically format and lint code before committing.

---

This document serves as a starting point. It should be reviewed and updated periodically as the project evolves. 