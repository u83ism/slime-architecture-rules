# Slime Architecture Rules — Level 7 (Orchestrate Folders)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv7**: multi-domain coordination is moved out of the App layer into `orchestrate/<name>/` folders, logic tests are mandatory, and post-commit side effects use `defer()`.

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
  domains/user/
    routes.ts
    workflow.ts
    logic.ts
    logic.test.ts   # Required at Lv7 — missing is a ❌ Error
    store.ts
  domains/order/
    routes.ts
    workflow.ts
    logic.ts
    logic.test.ts
    store.ts
  domains/auth/         # Upstream domain (see Lv6): depends on no other domain
    workflow.ts
    logic.ts
    logic.test.ts
    store.ts
  orchestrate/order-inventory/  # Multi-domain coordination taken out of the App layer
    workflow.ts
```

---

## Orchestrate Folder Rules (new at Lv7)

- Orchestrate folders live directly under `orchestrate/`, named in kebab-case: `orchestrate/order-inventory`, `orchestrate/user-onboarding`.
- An `orchestrate/` folder holds **coordination across multiple domains** that would otherwise bloat `app/workflow.ts`. It sits **above** domains.
- `orchestrate/` folders may import from domain folders and `shared/`.
- Domain folders must not import from `orchestrate/` folders.
- `orchestrate/` folders must not import from each other.
- `orchestrate/` folders must not import from `app/` (App layer reference is forbidden).

```
Allowed import directions:
  orchestrate/yyy  →  domains/xxx        ✅
  orchestrate/yyy  →  shared           ✅
  domains/xxx        →  orchestrate/yyy  ❌
  orchestrate/yyy  →  orchestrate/zzz  ❌
  orchestrate/yyy  →  app/             ❌
```

### When to create an orchestrate/ folder

Create an `orchestrate/` folder when:
- Multi-domain coordination is making `app/workflow.ts` large.
- Especially when several domains must be updated atomically.

Do **not** create an `orchestrate/` folder for:
- Capabilities used by many domains (identity/auth, tenant). Those are upstream domains (see Lv6).
- Concerns used by only one domain (keep it in that domain folder).
- Pure utilities or type definitions (those belong in `shared/`).

```ts
// OK — orchestrate folder coordinating domains
// orchestrate/order-inventory/workflow.ts
import { createOrder } from '../../domains/order/workflow'
import { deductStock } from '../../domains/inventory/workflow'

// NG — domain importing from an orchestrate folder
// domains/order/workflow.ts
import { createOrderWithInventory } from '../../orchestrate/order-inventory/workflow'  // not allowed
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

- Domain folders live directly under `domains/` in kebab-case: `domains/user`, `domains/order`.
- Inter-domain imports follow the declared dependency DAG (see Lv6). Nested domains are expressed as declared dependencies too.
- Domains must not import from `orchestrate/` folders.

### Layer rules within each domain
- `workflow.ts`: receives parsed input and the principal — calls store/logic and `client/adapter.ts` — never imports ORM directly, never touches HTTP objects.
- `logic.ts`: pure functions with domain-prefixed names, `Result` for fallible operations. Decides resource-level authorization from the principal and the loaded resource.
- `logic.test.ts`: **mandatory** — missing test file is a ❌ Error at Lv7.
- `store.ts`: `find*` / `list*` / `get*` / `count*` / `search*` / `create*` / `save*` / `update*` / `delete*` / `remove*` naming; no ORM types in return values.

---

## app/ Rules (unchanged from Lv6)

- `app/route.ts` aggregates domain routes only — no inline route definitions.
- `app/middleware.ts` is the HTTP gate (see Lv6). Credential checks call the upstream domain (e.g., `domains/auth`).
- **App layer must not contain** `logic.ts`, `store.ts`, or direct `client/` calls — App is an orchestration-only layer.

---

## shared/ and client/ Rules (unchanged from Lv6)

- `shared/utility.ts`, `shared/smallLogic.ts`: pure functions only (no side effects, no DB).
- `shared/store.ts`: shared DB access for data not yet assigned to a domain.
- `client/client.ts` + `client/adapter.ts`: external API calls and anti-corruption layer. Domains call the adapter, never `client.ts` directly.

---

## Error Handling

- **Validation failures**: framework returns HTTP 400. **Auth/middleware rejection**: 401, 403, or 429.
- **Business rejections travel as return values all the way to the route.** Domain `logic.ts` and `client/adapter.ts` return `Result.err(code)`. Workflows (domain, `orchestrate/`, and app) pass it upward with an early `return`. The response wrapper (`json(...)`) maps the code to a 4xx status.
- **Do not throw business rejections** from workflows — return `err(...)`. `throw` is reserved for technical failures (bugs, DB down, network), which become HTTP 500.
- Workflows that cannot reject may return a plain value.
- `withTransaction()` rolls back when its callback returns `err` (as well as when it throws) and commits on `ok`.
- **Each domain declares its own error codes** in `domains/xxx/errors.ts`, prefixed with the domain name (`domains/user` → `USER_*`). Domains know nothing about HTTP status codes.
- The status map lives outside the domains (`slime.config.ts`) and must cover the union of all domain codes. Use `satisfies Record<DomainErrorCode, number>` so a missing entry is a type error.
- Error responses use **Problem Details** (RFC 9457, `Content-Type: application/problem+json`) with a `code` extension member. Frontends may `import type` the code union to keep their message tables exhaustive.

```ts
// domains/user/errors.ts — codes only, no HTTP knowledge
export type UserErrorCode = "USER_ALREADY_EXISTS" | "USER_NOT_FOUND"

// slime.config.ts — an HTTP status for every code of every domain
type DomainErrorCode = UserErrorCode | OrderErrorCode
export default {
  errors: {
    USER_ALREADY_EXISTS: 409,
    USER_NOT_FOUND: 404,
    ORDER_OUT_OF_STOCK: 422,
  } satisfies Record<DomainErrorCode, number>,
}

// domains/user/workflow.ts — rejections are returned, not thrown
export const createUserWorkflow = async (input: CreateUserInput): Promise<Result<User, UserErrorCode>> => {
  const exists = await findUserByEmail(input.email)
  const check = userCanCreate(!!exists)
  if (!check.ok) return check
  return ok(await saveUser(input))
}
```

---

## General Principles

- **No runtime magic**: routes are always declared explicitly. No file-based auto-routing.
- **No DI container auto-registration**: import and wire dependencies manually.
- **Static over dynamic**: naming conventions are enforced by Kaachan at lint time, not at runtime.
- **Functional Core, Imperative Shell**: logic = pure core, workflow = imperative shell.

---

## What Kaachan Checks at Lv7

<!-- BEGIN GENERATED: kaachan-checks lv=7 （src/rules-catalog.ts から自動生成。手で編集しない） -->
Severity: 💡 Hint = information, ⚠️ Warning = likely problem, ❌ Error = violates this level's rules.

- ❌ Error — parse imports a DB/ORM module
- ❌ Error — A file in `parse/` exceeds ~300 lines
- ❌ Error — A workflow imports an ORM/DB module directly
- ❌ Error — A store function name violates the naming convention (`find*` / `list*` / `get*` / `count*` / `search*` / `create*` / `save*` / `update*` / `delete*` / `remove*`)
- ❌ Error — A store function returns an ORM type
- ❌ Error — logic imports store, client, or a DB/ORM module
- ❌ Error — logic throws (return a `Result` instead)
- ❌ Error — logic has no corresponding test file (`logic.test.ts`)
- ❌ Error — A file in `logic/` exceeds ~300 lines or still mixes domain prefixes
- ❌ Error — An inter-domain import that is not in the dependency declaration
- ❌ Error — The domain dependency declaration contains a cycle
- ❌ Error — `client/client.ts` is imported directly (bypassing `client/adapter.ts`)
- ❌ Error — `shared/utility.ts` or `shared/smallLogic.ts` has side effects
- ❌ Error — A file in `shared/` is too large
- ❌ Error — The App layer is too large
- ❌ Error — `app/store.ts` exists (the App layer must not own DB access)
- ❌ Error — `app/client.ts` exists (move it to `client/`)
- ❌ Error — The App layer contains logic (`app/logic.ts` or business judgment)
- ❌ Error — A domain imports from an `orchestrate/` folder
- ❌ Error — An `orchestrate/` folder imports from another `orchestrate/` folder
- ❌ Error — An `orchestrate/` folder imports from `app/`
- ⚠️ Warning — A route handler does work other than HTTP I/O (store, logic, or DB calls)
- ⚠️ Warning — `workflow.ts` imports an auth library directly (that is middleware's job)
- ⚠️ Warning — `workflow.ts` exceeds ~500 lines
- ⚠️ Warning — A workflow touches HTTP request, response, or context objects
- ⚠️ Warning — A workflow parses raw input directly (e.g., `JSON.parse()`)
- ⚠️ Warning — A workflow throws a plain `Error` (a business rejection would become HTTP 500; use `DomainError` at Lv3–4 and `err()` from Lv5)
- ⚠️ Warning — `parse.ts` exceeds ~500 lines (split into `parse/`)
- ⚠️ Warning — A workflow calls an ORM-specific transaction API directly (use `withTransaction()`)
- ⚠️ Warning — A logic function has no domain prefix (`userCan*`, etc.)
- ⚠️ Warning — `logic.ts` exceeds ~500 lines, mixes domain prefixes, or contains function groups whose type dependencies do not intersect
- ⚠️ Warning — A workflow throws a `DomainError` (from Lv5, return `err()` up to the route instead)
- ⚠️ Warning — A folder directly under `domains/` or `orchestrate/` is not named in kebab-case
- ⚠️ Warning — A domain error code lacks the domain prefix (`domains/user` → `USER_*`)
- ⚠️ Warning — `shared/` imports from a domain folder
- ⚠️ Warning — `app/route.ts` defines routes (move them to `domains/xxx/routes.ts`)
- ⚠️ Warning — `app/route.ts` is too large
- ⚠️ Warning — A route references a workflow file that does not exist (dead route candidate)
- ⚠️ Warning — A route past its `sunset` date still exists
- 💡 Hint — API routes are defined outside an `/api` group
- 💡 Hint — `workflow.ts` exceeds ~300 lines or ~10 functions
- 💡 Hint — A workflow calls a parse function (parsing belongs in route)
- 💡 Hint — `slime.config.ts` is missing (it maps error codes to HTTP status codes)
- 💡 Hint — `parse.ts` exceeds ~300 lines or ~10 functions (shared schemas are allowed)
- 💡 Hint — `logic.ts` exceeds ~300 lines or ~10 functions (consider splitting into `logic/`)
- 💡 Hint — A workflow is not referenced by any route (unreachable workflow candidate)
- 💡 Hint — A domain folder has no `routes.ts`
- 💡 Hint — Non-DB async work (email, external API calls) inside `withTransaction()` (suggests `defer()`; opt-in)
<!-- END GENERATED -->

---

## Guidance for AI Assistants

When a capability is needed by multiple domain folders (e.g., identity, tenant):
1. Identify whether it is truly a shared capability or just coincidentally similar code.
2. If it is a shared capability, propose extracting it into an upstream domain folder (e.g., `domains/auth/`) and declaring it as a dependency of the domains that use it.
3. Confirm the name, scope, and the updated dependency declaration with the user before creating the folder.
4. Keep HTTP-gate code in `app/middleware.ts`; the middleware calls the upstream domain.

When `app/workflow.ts` grows with multi-domain coordination:
1. Propose moving the coordination into an `orchestrate/<name>/` folder.
2. Confirm the name and scope with the user before creating the folder.
3. Verify that no domain imports from the new `orchestrate/` folder.

When adding side effects (email, notifications, analytics) to a workflow:
- Use `defer()` to move them outside the transaction lock window.
- If the side effect is heavy or must be reliable (retry-on-failure), suggest delegating to a queue instead of `defer()`.

---

## Next Step: Lv8

To advance to Lv8, introduce:
- `shared/events.ts` — domain event type definitions shared across domains
- Specialize `orchestrate/` folders for transactional operations; use domain events for non-transactional side effects

Run `slime level:next` to check what is needed.
