# Slime Architecture Rules — Level 7 (Cross Folders)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv7**: cross-domain concerns are isolated in `cross-<name>/` folders, logic tests are mandatory, and post-commit side effects use `defer()`.

---

## Project Structure

```
src/
  app/
    route.ts
    workflow.ts
    parse.ts
    middleware.ts
  shared/
    utility.ts
    smallLogic.ts
    store.ts
  client/
    client.ts
    adapter.ts
  domainUser/
    routes.ts
    workflow.ts
    logic.ts
    logic.test.ts   # Required at Lv7 — missing is a ❌ Error
    store.ts
  domainOrder/
    routes.ts
    workflow.ts
    logic.ts
    logic.test.ts
    store.ts
  cross-auth/         # Cross-domain concern: spans multiple domains, owned by none
    logic.ts
    store.ts
  cross-notification/ # Cross-domain concern: notification dispatch
    logic.ts
```

---

## Cross Folder Rules (new at Lv7)

- Cross folders are named with the `cross-` prefix in kebab-case: `cross-auth`, `cross-notification`, `cross-billing`.
- A `cross-` folder encapsulates a concern that is **needed by multiple domains** but belongs to none of them.
- Domains **may import from** `cross-` folders. `cross-` folders must not import from domain folders.
- `cross-` folders must not import from each other.
- `cross-` folders must not import from `app/` (App layer reference is forbidden).
- `cross-` folders follow the same internal layer rules as domain folders (pure logic, named store functions, etc.).

```
Allowed import directions:
  domainXxx  →  cross-yyy   ✅
  cross-yyy  →  shared      ✅
  cross-yyy  →  domainXxx   ❌
  cross-yyy  →  cross-zzz   ❌
  cross-yyy  →  app/        ❌
```

### When to create a cross- folder

Create a `cross-` folder when:
- Two or more domain folders need the same logic/store/client.
- The concern does not "belong" to any single domain (e.g., auth spans all domains, notifications are triggered by many domains).

Do **not** create a `cross-` folder for:
- Concerns used by only one domain (keep it in that domain folder).
- Pure utilities or type definitions (those belong in `shared/`).

```ts
// OK — domain importing from cross folder
// domainOrder/workflow.ts
import { verifyPermission } from '../cross-auth/logic'

// NG — cross folder importing from domain
// cross-notification/logic.ts
import { findOrderById } from '../domainOrder/store'  // not allowed
```

---

## defer() — Post-Commit Side Effects (new at Lv7)

`defer()` moves side effects outside the transaction critical section to minimize lock time.

- Called **inside** `withTransaction()`: executes after the DB commit succeeds.
- Called **outside** `withTransaction()`: executes immediately after the main operation completes (in-process).
- Use for: email sending, external API calls, analytics — operations where failure does not require rollback.
- Heavy operations should be delegated to a queue (separate process) rather than using `defer()`.

```ts
// Inside a transaction — sends email after commit, not before
export const CreateUserWorkflow = async (input: ValidatedInput) => {
  return withTransaction(async () => {
    const user = await saveUser(input)

    defer(async () => {
      await sendWelcomeMail(user.email)  // runs after DB commit
    })

    return user
  })
}

// Outside a transaction — runs after main operation completes
export const UpdateProfileWorkflow = async (input: ValidatedInput) => {
  const user = await updateUser(input)

  defer(async () => {
    await analyticsClient.track('profile_updated', user.id)  // non-critical side effect
  })

  return user
}
```

---

## Domain Folder Rules (unchanged from Lv6, with stricter logic test requirement)

- Domain folders are named `domain[A-Z]camelCase`: `domainUser`, `domainOrder`.
- Each domain is self-contained and must not import from other domain folders.
- Domains may import from `cross-` folders.
- Domain nesting: upper-level domains may reference lower-level domains, but lower-level domains must not reference each other (avoid circular domain dependencies).

### Layer rules within each domain
- `workflow.ts`: orchestrates — calls parse/store/logic — never imports ORM directly.
- `logic.ts`: pure functions with domain-prefixed names, `Result` for fallible operations.
- `logic.test.ts`: **mandatory** — missing test file is a ❌ Error at Lv7.
- `store.ts`: `find*` / `list*` / `get*` / `count*` / `search*` / `create*` / `save*` / `update*` / `delete*` / `remove*` naming; no ORM types in return values.

---

## app/ Rules (unchanged from Lv6)

- `app/route.ts` aggregates domain routes only — no inline route definitions.
- `app/middleware.ts` defines application-wide middleware.
- **App layer must not contain** `logic.ts`, `store.ts`, or direct `client/` calls — App is an orchestration-only layer.

---

## shared/ and client/ Rules (unchanged from Lv6)

- `shared/utility.ts`, `shared/smallLogic.ts`: pure functions only (no side effects, no DB).
- `shared/store.ts`: shared DB access for data not yet assigned to a domain.
- `client/client.ts` + `client/adapter.ts`: external API calls and anti-corruption layer.

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
- No imports from domain folders into `cross-` folders (reverse direction is forbidden).
- No cross-to-cross imports.
- **`logic.test.ts` missing in any domain or `cross-` folder → ❌ Error** (upgraded from 💡 Hint at Lv6).
- App layer does not contain `logic.ts`, `store.ts`, or direct `client/` imports.
- All Lv6 checks continue to apply.

---

## Guidance for AI Assistants

When a concern appears in multiple domain folders:
1. Identify whether it is truly cross-domain or just coincidentally similar code.
2. If it is genuinely shared logic (same business rule, same external service), propose extracting it into a `cross-<name>/` folder.
3. Confirm the name and scope with the user before creating the folder.
4. After extraction, update all domain imports to reference the new `cross-` folder.
5. Verify that the `cross-` folder does not import from any domain folder.

When adding side effects (email, notifications, analytics) to a workflow:
- Use `defer()` to move them outside the transaction lock window.
- If the side effect is heavy or must be reliable (retry-on-failure), suggest delegating to a queue instead of `defer()`.

---

## Next Step: Lv8

To advance to Lv8, introduce:
- `shared/events.ts` — domain event type definitions shared across domains
- Specialize `cross-` folders for transactional operations; use domain events for non-transactional side effects

Run `slime level:next` to check what is needed.
