# Slime Architecture Rules — Level 7 (Cross Folders)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv7**: cross-domain concerns are isolated in `cross-<name>/` folders.

---

## Project Structure

```
src/
  app/
    route.ts
    routes/
      api.ts
      web.ts
    workflow.ts
    parse.ts
    middleware.ts
  shared/
  domainUser/
    workflow.ts
    parse.ts
    repository.ts
    client.ts
    logic.ts
    routes.ts
  domainOrder/
    workflow.ts
    parse.ts
    repository.ts
    client.ts
    logic.ts
    routes.ts
  cross-auth/         # Cross-domain concern: authentication logic
    logic.ts
    repository.ts
    client.ts
  cross-notification/ # Cross-domain concern: notification dispatch
    client.ts
    logic.ts
```

---

## Cross Folder Rules

- Cross folders are named with the `cross-` prefix in kebab-case: `cross-auth`, `cross-notification`, `cross-billing`.
- A `cross-` folder encapsulates a concern that is **needed by multiple domains** but belongs to none of them.
- Domains **may import from** `cross-` folders. `cross-` folders must not import from domain folders.
- `cross-` folders follow the same internal layer rules as domain folders (pure logic, no direct ORM in workflow, etc.).
- `cross-` folders must not import from each other.

```
Allowed import directions:
  domainXxx  →  cross-yyy   ✅
  cross-yyy  →  shared      ✅
  cross-yyy  →  domainXxx   ❌
  cross-yyy  →  cross-zzz   ❌
```

### When to create a cross- folder

Create a `cross-` folder when:
- Two or more domain folders need the same logic/repository/client.
- The concern does not "belong" to any single domain (e.g., auth spans all domains, notifications are triggered by many domains).

Do **not** create a `cross-` folder for:
- Concerns used by only one domain (keep it in that domain folder).
- Pure utilities or type definitions (those belong in `shared/`).

```ts
// OK — domain importing from cross folder
// domainOrder/workflow.ts
import { sendOrderConfirmation } from '../cross-notification/client'
import { verifyPermission } from '../cross-auth/logic'

// NG — cross folder importing from domain
// cross-notification/client.ts
import { findOrderById } from '../domainOrder/repository'  // not allowed
```

---

## Domain Folder Rules (unchanged from Lv6)

- Domain folders are named `domain[A-Z]camelCase`: `domainUser`, `domainOrder`.
- Each domain is self-contained and must not import from other domain folders.
- All Lv1–Lv6 layer rules apply within each domain.

### Layer rules within each domain
- `workflow.ts` orchestrates — calls parse/repository/client/logic — never imports ORM directly.
- `parse.ts` is pure transformation — no DB access.
- `repository.ts` uses `find*` / `list*` / `save*` / `create*` naming.
- `client.ts` is the anti-corruption layer for external APIs.
- `logic.ts` contains pure functions with domain-prefixed names, returns `Result` for fallible operations.

---

## app/ Rules (unchanged from Lv6)

- `app/route.ts` aggregates domain routes only — no inline route definitions.
- `app/routes/api.ts` applies `/api` prefix and delegates to domain routes.
- `app/middleware.ts` defines application-wide middleware.

---

## Error Handling

```ts
// slime.config.ts
export default {
  errors: {
    USER_ALREADY_EXISTS: 409,
    UNAUTHORIZED: 403,
    FORBIDDEN: 403,
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

## What Kaachan Checks at Lv7

- Cross folders follow `cross-[a-z]` naming (kebab-case with `cross-` prefix).
- No imports from `cross-` folders into domain folders in the reverse direction.
- No cross-to-cross imports.
- All Lv6 checks continue to apply.

---

## Guidance for AI Assistants

When a concern appears in multiple domain folders:
1. Identify whether it is truly cross-domain or just coincidentally similar code.
2. If it is genuinely shared logic (same business rule, same external service), propose extracting it into a `cross-<name>/` folder.
3. Confirm the name and scope with the user before creating the folder.
4. After extraction, update all domain imports to reference the new `cross-` folder.
5. Verify that the `cross-` folder does not import from any domain folder.

---

## Next Step: Lv8

To advance to Lv8, introduce:
- `shared/events.ts` — domain event type definitions shared across domains

Run `slime level:next` to check what is needed.
