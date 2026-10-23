# Slime Architecture Rules — Level 7 (Orchestrate Folders)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv7**: multi-domain coordination is moved out of the App layer into `orchestrate-<name>/` folders, logic tests are mandatory, and post-commit side effects use `defer()`.

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
  domainAuth/         # Upstream domain (see Lv6): depends on no other domain
    workflow.ts
    logic.ts
    logic.test.ts
    store.ts
  orchestrate-order-inventory/  # Multi-domain coordination taken out of the App layer
    workflow.ts
```

---

## Orchestrate Folder Rules (new at Lv7)

- Orchestrate folders are named with the `orchestrate-` prefix in kebab-case: `orchestrate-order-inventory`, `orchestrate-user-onboarding`.
- An `orchestrate-` folder holds **coordination across multiple domains** that would otherwise bloat `app/workflow.ts`. It sits **above** domains.
- `orchestrate-` folders may import from domain folders and `shared/`.
- Domain folders must not import from `orchestrate-` folders.
- `orchestrate-` folders must not import from each other.
- `orchestrate-` folders must not import from `app/` (App layer reference is forbidden).

```
Allowed import directions:
  orchestrate-yyy  →  domainXxx        ✅
  orchestrate-yyy  →  shared           ✅
  domainXxx        →  orchestrate-yyy  ❌
  orchestrate-yyy  →  orchestrate-zzz  ❌
  orchestrate-yyy  →  app/             ❌
```

### When to create an orchestrate- folder

Create an `orchestrate-` folder when:
- Multi-domain coordination is making `app/workflow.ts` large.
- Especially when several domains must be updated atomically.

Do **not** create an `orchestrate-` folder for:
- Capabilities used by many domains (identity/auth, tenant). Those are upstream domains (see Lv6).
- Concerns used by only one domain (keep it in that domain folder).
- Pure utilities or type definitions (those belong in `shared/`).

```ts
// OK — orchestrate folder coordinating domains
// orchestrate-order-inventory/workflow.ts
import { createOrder } from '../domainOrder/workflow'
import { deductStock } from '../domainInventory/workflow'

// NG — domain importing from an orchestrate folder
// domainOrder/workflow.ts
import { createOrderWithInventory } from '../orchestrate-order-inventory/workflow'  // not allowed
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
- Inter-domain imports follow the declared dependency DAG (see Lv6). Nested domains are expressed as declared dependencies too.
- Domains must not import from `orchestrate-` folders.

### Layer rules within each domain
- `workflow.ts`: receives parsed input and the principal — calls store/logic and `client/adapter.ts` — never imports ORM directly, never touches HTTP objects.
- `logic.ts`: pure functions with domain-prefixed names, `Result` for fallible operations. Decides resource-level authorization from the principal and the loaded resource.
- `logic.test.ts`: **mandatory** — missing test file is a ❌ Error at Lv7.
- `store.ts`: `find*` / `list*` / `get*` / `count*` / `search*` / `create*` / `save*` / `update*` / `delete*` / `remove*` naming; no ORM types in return values.

---

## app/ Rules (unchanged from Lv6)

- `app/route.ts` aggregates domain routes only — no inline route definitions.
- `app/middleware.ts` is the HTTP gate (see Lv6). Credential checks call the upstream domain (e.g., `domainAuth`).
- **App layer must not contain** `logic.ts`, `store.ts`, or direct `client/` calls — App is an orchestration-only layer.

---

## shared/ and client/ Rules (unchanged from Lv6)

- `shared/utility.ts`, `shared/smallLogic.ts`: pure functions only (no side effects, no DB).
- `shared/store.ts`: shared DB access for data not yet assigned to a domain.
- `client/client.ts` + `client/adapter.ts`: external API calls and anti-corruption layer. Domains call the adapter, never `client.ts` directly.

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

- Orchestrate folders follow `orchestrate-[a-z]` naming (kebab-case with `orchestrate-` prefix).
- Domain folders do not import from `orchestrate-` folders.
- No orchestrate-to-orchestrate imports.
- `orchestrate-` folders do not import from `app/`.
- **`logic.test.ts` missing in any domain folder → ❌ Error** (upgraded from 💡 Hint at Lv6).
- App layer does not contain `logic.ts`, `store.ts`, or direct `client/` imports.
- All Lv6 checks continue to apply.

---

## Guidance for AI Assistants

When a capability is needed by multiple domain folders (e.g., identity, tenant):
1. Identify whether it is truly a shared capability or just coincidentally similar code.
2. If it is a shared capability, propose extracting it into an upstream domain folder (e.g., `domainAuth/`) and declaring it as a dependency of the domains that use it.
3. Confirm the name, scope, and the updated dependency declaration with the user before creating the folder.
4. Keep HTTP-gate code in `app/middleware.ts`; the middleware calls the upstream domain.

When `app/workflow.ts` grows with multi-domain coordination:
1. Propose moving the coordination into an `orchestrate-<name>/` folder.
2. Confirm the name and scope with the user before creating the folder.
3. Verify that no domain imports from the new `orchestrate-` folder.

When adding side effects (email, notifications, analytics) to a workflow:
- Use `defer()` to move them outside the transaction lock window.
- If the side effect is heavy or must be reliable (retry-on-failure), suggest delegating to a queue instead of `defer()`.

---

## Next Step: Lv8

To advance to Lv8, introduce:
- `shared/events.ts` — domain event type definitions shared across domains
- Specialize `orchestrate-` folders for transactional operations; use domain events for non-transactional side effects

Run `slime level:next` to check what is needed.
