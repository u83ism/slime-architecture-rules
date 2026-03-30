# Slime Architecture Rules — Level 6 (Domain Folders)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv6**: the codebase is split into domain folders. Each domain owns its full stack.

---

## Project Structure

```
src/
  app/
    route.ts        # Entry point — imports and aggregates domain routes
    workflow.ts     # App-level orchestration (coordinates across domains)
    parse.ts        # App-level parse (parses input before passing to domain workflows)
    middleware.ts   # App-level middleware (auth, rate limiting, CORS, etc.)
  shared/
    utility.ts      # Shared pure utility functions
    smallLogic.ts   # Small logic not worth its own domain (pure functions only)
    store.ts        # Shared DB access for data not yet assigned to a domain
  client/
    client.ts       # External API calls
    adapter.ts      # Anti-corruption layer: maps external vocabulary to domain vocabulary
  domainUser/       # One folder per business domain
    routes.ts       # Route definitions for this domain
    workflow.ts     # Domain workflow (receives already-parsed input from app layer)
    logic.ts        # Domain business judgment and calculations
    store.ts        # Domain-specific DB access
  domainOrder/
    routes.ts
    workflow.ts
    logic.ts
    store.ts
```

---

## Domain Folder Rules

- Domain folders are named with the `domain` prefix in camelCase: `domainUser`, `domainOrder`, `domainPayment`.
- Each domain folder is **self-contained**: it owns its workflow, logic, store, and routes.
- **Domains must not import from each other directly.** Inter-domain communication goes through `shared/` or events (introduced at Lv8).
- `app/` is the only layer allowed to import from multiple domains (to aggregate routes and orchestrate).

```ts
// NG — domain importing from another domain
// domainOrder/workflow.ts
import { findUserById } from '../domainUser/store'  // not allowed
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

### app/workflow.ts
- Coordinates across multiple domains: receives parsed input, calls domain workflows, handles domain events.
- Must not contain business judgment logic (belongs in domain `logic.ts`).
- Must not contain DB access (`store.ts`), external API calls (`client/`), or infrastructure code.

### app/parse.ts
- Handles app-level request parsing. Domain workflows receive already-parsed, typed input.
- Must not access DB or external APIs — pure transformation only.

### domainXxx/routes.ts
- Registers URL patterns, middleware, and workflow handlers for this domain.
- Middleware is attached explicitly on each route.

```ts
// domainUser/routes.ts
export const userRoutes = (r: Router) => {
  r.get('/users',     slime.auth(), ListUsersWorkflow)
  r.post('/users',    slime.auth(), CreateUserWorkflow)
  r.get('/users/:id', slime.auth(), GetUserWorkflow)
}
```

### domainXxx/workflow.ts
- Receives already-parsed, typed input from the app layer.
- Calls domain `store.ts` for DB operations and `client/` for external API calls via the app layer.
- Must not contain business judgment (belongs in `logic.ts`).
- Must not import ORM/DB modules directly.

### domainXxx/logic.ts
- Pure functions only: no DB access, no external API calls, no side effects.
- Must have domain-prefixed names (`userCan*`, `orderCan*`, `calcOrder*`, etc.).
- Fallible functions return `Result` type — no `throw`.
- **Must be tested** (`logic.test.ts`). Missing tests are a 💡 Hint at Lv6.

### domainXxx/store.ts
- Domain-specific DB reads and writes.
- Must not return ORM types — return plain domain types only.
- Naming convention (now **Error** if violated, up from Hint at Lv5):
  - Reads: `find*` / `list*` / `get*` / `count*` / `search*`
  - Writes: `create*` / `save*` / `update*` / `delete*` / `remove*`

### shared/
- `shared/utility.ts`: pure utility functions shared across domains (no side effects).
- `shared/smallLogic.ts`: small pure logic not worth its own domain (no DB access, no side effects).
- `shared/store.ts`: DB access for data not yet assigned to a specific domain (temporary placement).
- Must not import from any domain folder.
- Suitable for: shared type definitions, common error codes, utility functions.

### client/
- `client/client.ts`: all external API calls. Workflows must not use `fetch`/axios directly.
- `client/adapter.ts`: anti-corruption layer — translates external API vocabulary to domain vocabulary. External errors become domain `Result.err` or re-thrown as technical errors.
- Domains call `client/` through the app layer (domain workflows do not import from `client/` directly).
- Must not make business judgments — only translate external responses.

```ts
// client/adapter.ts
export const chargePayment = async (amount: number): Promise<Result<Receipt, "PAYMENT_DECLINED">> => {
  try {
    const res = await stripeClient.charge(amount)
    return ok(mapToReceipt(res))
  } catch (e) {
    if (e.code === 'card_declined') return err("PAYMENT_DECLINED")
    throw e
  }
}
```

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
- `app/route.ts` does not contain inline route definitions (aggregation only) — ⚠️ Warning if violated.
- `app/workflow.ts` does not contain `logic.ts`, `store.ts`, or `client/` code (not allowed in App layer).
- `store.ts` function naming violations are now **❌ Error** (upgraded from 💡 Hint at Lv5).
- `store.ts` still must not return ORM types.
- All Lv4–Lv5 checks continue to apply within each domain.

---

## Guidance for AI Assistants

When adding a new feature that spans multiple domains:
1. Identify which domain owns the primary responsibility.
2. If data from another domain is needed, have the app-layer workflow resolve it and pass it as a parameter to the domain workflow.
3. If cross-domain coordination is complex, suggest preparing for Lv7 (`cross-` folders).
4. Never add direct imports between domain folders — propose the correct pattern instead.

When `app/route.ts` or `shared/store.ts` is growing large:
- `app/route.ts` growing = signal that domain `routes.ts` files are not being used properly.
- `shared/store.ts` growing = signal that DB access should be moved into the appropriate domain `store.ts`.

---

## Next Step: Lv7

To advance to Lv7, introduce:
- `cross-<name>/` folders for concerns that span multiple domains (e.g., `cross-auth/`, `cross-notification/`)
- `defer()` for post-commit side effects
- Make logic tests mandatory (Error if missing)

Run `slime level:next` to check what is needed.
