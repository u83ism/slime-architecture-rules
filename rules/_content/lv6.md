# Slime Architecture Rules — Level 6 (Domain Folders)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv6**: the codebase is split into domain folders. Each domain owns its full stack.

---

## Project Structure

```
src/
  app/
    route.ts        # Entry point — imports and aggregates domain routes
    routes/
      api.ts        # /api/* namespace (applies prefix, delegates to domain routes)
      web.ts        # /* namespace (for future web routes; may be empty)
    workflow.ts     # App-level workflows (non-domain-specific operations)
    parse.ts        # App-level parse
    middleware.ts   # App-level middleware (auth, rate limiting, CORS, etc.)
  shared/
    # Shared types, utilities, and constants used across domains
  domainUser/       # One folder per business domain
    workflow.ts
    parse.ts
    repository.ts
    client.ts
    logic.ts
    routes.ts       # Route definitions for this domain (no /api prefix — added by app/routes/api.ts)
  domainOrder/
    workflow.ts
    parse.ts
    repository.ts
    client.ts
    logic.ts
    routes.ts
```

---

## Domain Folder Rules

- Domain folders are named with the `domain` prefix in camelCase: `domainUser`, `domainOrder`, `domainPayment`.
- Each domain folder is **self-contained**: it owns its workflow, parse, repository, client, and logic.
- **Domains must not import from each other directly.** Inter-domain communication goes through `shared/` or events (introduced at Lv8).
- `app/` is the only layer allowed to import from multiple domains (to aggregate routes).

```ts
// NG — domain importing from another domain
// domainOrder/workflow.ts
import { findUserById } from '../domainUser/repository'  // not allowed
```

### app/route.ts
- Aggregates domain routes only — no route definitions here.
- No business logic, no middleware definitions.

```ts
// app/route.ts
import { userRoutes } from '../domainUser/routes'
import { orderRoutes } from '../domainOrder/routes'
export const routes = [userRoutes, orderRoutes]
```

### app/routes/api.ts
- Applies the `/api` prefix and delegates to domain routes.
- Versioning (`/v1`, `/v2`) is added here if needed — domain routes stay prefix-agnostic.

```ts
// app/routes/api.ts
route.group({ prefix: '/api' }, (r) => {
  r.use(userRoutes)    // domain/user routes → /api/users
  r.use(orderRoutes)   // domain/order routes → /api/orders
})
```

### domainXxx/routes.ts
- Defines routes for this domain without any `/api` prefix — the prefix is applied in `app/routes/api.ts`.
- Middleware is attached explicitly on each route.

```ts
// domainUser/routes.ts
export const userRoutes = (r: Router) => {
  r.get('/users',     slime.auth(), ListUsersWorkflow)
  r.post('/users',    slime.auth(), CreateUserWorkflow)
  r.get('/users/:id', slime.auth(), GetUserWorkflow)
}
```

### Layer rules within each domain
All Lv1–Lv5 layer rules apply within each domain folder:
- `workflow.ts` orchestrates, calls parse/repository/client/logic — never imports ORM directly.
- `parse.ts` is pure transformation — no DB access.
- `repository.ts` uses `find*` / `list*` / `save*` / `create*` naming.
- `client.ts` is the anti-corruption layer for external APIs.
- `logic.ts` contains pure functions with domain-prefixed names, returns `Result` for fallible operations.

### shared/
- Contains types, utilities, and constants shared across multiple domains.
- Must not import from any domain folder.
- Suitable for: shared type definitions, utility functions, common error codes.

---

## Error Handling

Configure `slime.config.ts` to map domain error codes to HTTP status codes:

```ts
export default {
  errors: {
    USER_ALREADY_EXISTS: 409,
    UNAUTHORIZED: 403,
    OUT_OF_STOCK: 422,
    NOT_FOUND: 404,
    PAYMENT_DECLINED: 402,
  }
}
```

- **Validation failures**: framework maps to HTTP 400.
- **Auth/middleware rejection**: framework maps to 401, 403, or 429.
- **Domain errors**: `throw new Error(code)` → framework maps via error config to 4xx.
- **Unhandled throws**: framework maps to HTTP 500.

---

## General Principles

- **No runtime magic**: routes are always declared explicitly. No file-based auto-routing.
- **No DI container auto-registration**: import and wire dependencies manually.
- **Static over dynamic**: naming conventions are enforced by Kaachan at lint time, not at runtime.
- **Functional Core, Imperative Shell**: logic = pure core, workflow = imperative shell.

---

## What Kaachan Checks at Lv6

- Domain folders follow `domain[A-Z]` naming (camelCase with `domain` prefix).
- No direct imports between domain folders.
- `app/route.ts` does not contain route definitions (aggregation only).
- If `app/route.ts` contains inline route definitions, Kaachan emits a ⚠️ Warning.
- All Lv4–Lv5 checks continue to apply within each domain.

---

## Guidance for AI Assistants

When adding a new feature that spans multiple domains:
1. Identify which domain owns the primary responsibility.
2. If data from another domain is needed, prefer passing it as a parameter (resolved by the calling workflow) rather than importing cross-domain.
3. If cross-domain coordination is complex, suggest preparing for Lv7 (`cross-` folders).
4. Never add direct imports between domain folders — propose the correct pattern instead.

---

## Next Step: Lv7

To advance to Lv7, introduce:
- `cross-<name>/` folders for concerns that span multiple domains (e.g., `cross-auth/`, `cross-notification/`)

Run `slime level:next` to check what is needed.
