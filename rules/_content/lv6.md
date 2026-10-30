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
    parse.ts        # Schemas shared by multiple domains only
    middleware.ts   # App-level middleware (auth, rate limiting, CORS, etc.)
  shared/
    utility.ts      # Shared pure utility functions
    smallLogic.ts   # Small logic not worth its own domain (pure functions only)
    store.ts        # Shared DB access for data not yet assigned to a domain
  client/
    client.ts       # External API calls
    adapter.ts      # Anti-corruption layer: maps external vocabulary to domain vocabulary
  domains/auth/       # Upstream domain: identity used by many domains (depends on no other domain)
    workflow.ts
    logic.ts
    store.ts
  domains/user/       # One folder per business domain
    routes.ts       # Route definitions: combines parse and workflow for this domain
    parse.ts        # Input schemas for this domain (moved from app/ at Lv6)
    errors.ts       # Error codes for this domain (USER_*; types only)
    workflow.ts     # Domain workflow (receives parsed input and the principal)
    logic.ts        # Domain business judgment and calculations
    store.ts        # Domain-specific DB access
  domains/order/
    routes.ts
    parse.ts
    workflow.ts
    logic.ts
    store.ts
```

---

## Domain Folder Rules

- Domain folders live directly under `domains/`, named in kebab-case: `domains/user`, `domains/order`, `domains/order-item`. Everything directly under `domains/` is a domain; nothing else is.
- Each domain folder is **self-contained**: it owns its workflow, logic, store, and routes.
- **Inter-domain imports must follow the declared dependency DAG.** Declare in `slime.config.ts` which domains each domain may depend on. Undeclared directions and cycles are forbidden. Nested domains are expressed as declared dependencies too.
- `app/` may import from any domain regardless of the declaration (to aggregate routes and orchestrate).
- Capabilities used by many domains (identity/auth, tenant) are **upstream domains**: ordinary domain folders that depend on no other domain. Do not create a special folder kind for them.
- Settings belong to the domain whose rules use them. A single settings table is a storage detail, not a domain boundary.
- **Table ownership**: declare in `slime.config.ts` which domain owns each table (by ORM model name). Only the owning domain's store writes to a table. Reading another domain's table goes through the owning domain's store functions, following the dependency DAG — never query it directly. A table has exactly one owner; tables with no declared owner are handled from `shared/store.ts`.
- To combine data owned by several domains, fetch each in bulk with the owner's `find*ByIds` and join in memory. If that becomes too heavy or complex, it is a sign to move to Lv10, where read-side adapters may join across domains.
- Slime Architecture does not cover database design itself (normalization, indexes, column types, naming) — only which domain owns which table.

```ts
// slime.config.ts — declared dependency DAG
export default {
  domains: {
    auth: [],                            // upstream: depends on no other domain
    user: ['auth'],
    order: ['auth', 'user'],
  },
  // table ownership: domain → tables it owns (ORM model names)
  tables: {
    auth: ['session'],
    user: ['user', 'userProfile'],
    order: ['order', 'orderItem'],
  },
}

// OK — declared direction
// domains/order/workflow.ts
import { findUserById } from '../user/store'

// NG — undeclared direction (domains/user does not declare domains/order)
// domains/user/workflow.ts
import { findOrderById } from '../order/store'  // not allowed
```

### app/route.ts
- Aggregates domain routes only — no route definitions here.
- No business logic, no middleware definitions.

```ts
// app/route.ts
import { userRoutes } from '../domains/user/routes'
import { orderRoutes } from '../domains/order/routes'
export const routes = [userRoutes, orderRoutes]
```

### app/workflow.ts
- Coordinates across multiple domains: receives parsed input, calls domain workflows, handles domain events.
- Must not contain business judgment logic (belongs in domain `logic.ts`).
- Must not contain DB access (`store.ts`), external API calls (`client/`), or infrastructure code.

### app/parse.ts
- Holds only schemas shared by multiple domains. Each domain's own input schemas live in `domains/xxx/parse.ts`.
- Must not access DB or external APIs — pure transformation only.

### app/middleware.ts
- The HTTP gate for the whole application (see Lv2–Lv5 rules): HTTP-specific concerns, converting credentials into a principal, and coarse role-based authorization.
- Credential checks call the upstream domain (e.g., `domains/auth`). Do not place middleware inside domain folders — it inverts dependencies between the domain that owns the middleware and the domains that use it.
- Must not perform resource-level authorization (that belongs in domain `logic.ts`).

### domains/xxx/routes.ts
- Registers URL patterns, middleware, and the parse + workflow combination for this domain (see Lv3).
- Middleware is attached explicitly on each route.

```ts
// domains/user/routes.ts
export const userRoutes = (r: Router) => {
  r.get('/users',     slime.auth(), json(ListUsersWorkflow))
  r.post('/users',    slime.auth(), json(parseCreateUser, CreateUserWorkflow, { status: 201 }))
  r.get('/users/:id', slime.auth(), json(parseGetUser, GetUserWorkflow))
}
```

### domains/xxx/parse.ts
- Input schemas for this domain. Same rules as Lv3 `parse.ts`.

### domains/xxx/workflow.ts
- Receives parsed, typed input and the principal from `routes.ts` (see Lv3). Never touches HTTP objects.
- Calls domain `store.ts` for DB operations and `client/adapter.ts` for external API calls.
- Must not contain business judgment (belongs in `logic.ts`).
- Must not import ORM/DB modules directly.

### domains/xxx/logic.ts
- Pure functions only: no DB access, no external API calls, no side effects.
- Must have domain-prefixed names (`userCan*`, `orderCan*`, `calcOrder*`, etc.).
- Decides resource-level authorization from the principal and the loaded resource (e.g., `postCanEdit(principal, post)`).
- Fallible functions return `Result` type — no `throw`.
- **Must be tested** (`logic.test.ts`). Missing tests are a ⚠️ Warning at Lv6 and become a ❌ Error at Lv7.

### domains/xxx/store.ts
- Domain-specific DB reads and writes.
- Must not return ORM types — return plain domain types only.
- Naming convention (now **Error** if violated, up from Hint at Lv5):
  - Reads: `find*` / `list*` / `get*` / `count*` / `search*`
  - Writes: `create*` / `save*` / `update*` / `delete*` / `remove*`
- Must not accept ORM types or query builders as parameters (now **Error**, up from Warning at Lv5).
- Read functions keep the four shapes from Lv4: by ID (`find*ByIds` returning a `Map`, primary), unique key / lock, filtering via `list*(filter, page)` with a closed business-vocabulary filter type, and condition-tree search via `search*(query, page)` whose fields and operators are closed literal unions. Screen-specific reads get a purpose-named function. Never call the store inside a loop.

### shared/
- `shared/utility.ts`: pure utility functions shared across domains (no side effects).
- `shared/smallLogic.ts`: small pure logic not worth its own domain (no DB access, no side effects).
- `shared/store.ts`: DB access for data not yet assigned to a specific domain (temporary placement).
- Must not import from any domain folder.
- Suitable for: shared type definitions, common error codes, utility functions.

### client/
- `client/client.ts`: all external API calls. Workflows must not use `fetch`/axios directly.
- `client/adapter.ts`: anti-corruption layer — translates external API vocabulary to domain vocabulary. External errors become domain `Result.err` or re-thrown as technical errors.
- Domain workflows may import `client/adapter.ts` directly. Calling `client/client.ts` directly is forbidden — always go through the adapter. The adapter has already translated external vocabulary into domain vocabulary, so for a domain it plays the same role as `store.ts`.
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

## What Kaachan Checks at Lv6

<!-- BEGIN GENERATED: kaachan-checks lv=6 （src/rules-catalog.ts から自動生成。手で編集しない） -->
Severity: 💡 Hint = information, ⚠️ Warning = likely problem, ❌ Error = violates this level's rules.

- ❌ Error — parse imports a DB/ORM module
- ❌ Error — A file in `parse/` exceeds ~300 lines
- ❌ Error — A workflow imports an ORM/DB module directly
- ❌ Error — A store function name violates the naming convention (`find*` / `list*` / `get*` / `count*` / `search*` / `create*` / `save*` / `update*` / `delete*` / `remove*`)
- ❌ Error — A store function returns an ORM type
- ❌ Error — A store function takes an ORM type or query builder as a parameter (lets callers build queries outside the store)
- ❌ Error — logic imports store, client, or a DB/ORM module
- ❌ Error — logic throws (return a `Result` instead)
- ❌ Error — A file in `logic/` exceeds ~300 lines or still mixes domain prefixes
- ❌ Error — An inter-domain import that is not in the dependency declaration
- ❌ Error — The domain dependency declaration contains a cycle
- ❌ Error — A domain store writes to a table owned by another domain
- ❌ Error — More than one domain declares ownership of the same table
- ❌ Error — `client/client.ts` is imported directly (bypassing `client/adapter.ts`)
- ❌ Error — `shared/utility.ts` or `shared/smallLogic.ts` has side effects
- ❌ Error — `app/client.ts` exists (move it to `client/`)
- ⚠️ Warning — A route handler does work other than HTTP I/O (store, logic, or DB calls)
- ⚠️ Warning — `workflow.ts` imports an auth library directly (that is middleware's job)
- ⚠️ Warning — `workflow.ts` exceeds ~500 lines
- ⚠️ Warning — A workflow touches HTTP request, response, or context objects
- ⚠️ Warning — A workflow parses raw input directly (e.g., `JSON.parse()`)
- ⚠️ Warning — A workflow throws a plain `Error` (a business rejection would become HTTP 500; use `DomainError` at Lv3–4 and `err()` from Lv5)
- ⚠️ Warning — `parse.ts` exceeds ~500 lines (split into `parse/`)
- ⚠️ Warning — A workflow calls an ORM-specific transaction API directly (use `withTransaction()`)
- ⚠️ Warning — A logic function has no domain prefix (`userCan*`, etc.)
- ⚠️ Warning — logic has no corresponding test file (`logic.test.ts`)
- ⚠️ Warning — `logic.ts` exceeds ~500 lines, mixes domain prefixes, or contains function groups whose type dependencies do not intersect
- ⚠️ Warning — A workflow throws a `DomainError` (from Lv5, return `err()` up to the route instead)
- ⚠️ Warning — A folder directly under `domains/` or `orchestrate/` is not named in kebab-case
- ⚠️ Warning — A domain store reads a table owned by another domain directly (go through the owning domain's functions; Lv10 read-side adapters are exempt)
- ⚠️ Warning — A domain error code lacks the domain prefix (`domains/user` → `USER_*`)
- ⚠️ Warning — `shared/` imports from a domain folder
- ⚠️ Warning — A file in `shared/` is too large
- ⚠️ Warning — The App layer is too large
- ⚠️ Warning — `app/store.ts` exists (the App layer must not own DB access)
- ⚠️ Warning — The App layer contains logic (`app/logic.ts` or business judgment)
- ⚠️ Warning — `app/route.ts` defines routes (move them to `domains/xxx/routes.ts`)
- ⚠️ Warning — `app/route.ts` is too large
- ⚠️ Warning — A route references a workflow file that does not exist (dead route candidate)
- ⚠️ Warning — A route past its `sunset` date still exists
- 💡 Hint — API routes are defined outside an `/api` group
- 💡 Hint — `workflow.ts` exceeds ~300 lines or ~10 functions
- 💡 Hint — A workflow calls a parse function (parsing belongs in route)
- 💡 Hint — `slime.config.ts` is missing (it maps error codes to HTTP status codes)
- 💡 Hint — `parse.ts` exceeds ~300 lines or ~10 functions (shared schemas are allowed)
- 💡 Hint — A store filter or search query has column names or operators typed as open types such as `string` (use a union of literals defined by the store)
- 💡 Hint — A store function is called inside a loop (`for` / `forEach` / `map`, etc.), which can cause N+1 queries (add a batch function to the store)
- 💡 Hint — `logic.ts` exceeds ~300 lines or ~10 functions (consider splitting into `logic/`)
- 💡 Hint — A domain store touches a table with no declared owner (declare it under `tables` in `slime.config.ts`)
- 💡 Hint — A workflow is not referenced by any route (unreachable workflow candidate)
- 💡 Hint — A domain folder has no `routes.ts`
- 💡 Hint — The App layer or `orchestrate/` repeatedly calls the same pair of domains together (consider merging them or redrawing the boundary)
- 💡 Hint — A domain folder has very little in it (consider merging it into another domain)
<!-- END GENERATED -->

---

## Guidance for AI Assistants

When adding a new feature that spans multiple domains:
1. Identify which domain owns the primary responsibility.
2. If data from another domain is needed and that dependency is declared, import it directly. Otherwise, have the app-layer workflow resolve it and pass it as a parameter to the domain workflow.
3. If multi-domain coordination is complex, suggest preparing for Lv7 (`orchestrate/` folders).
4. Never add an import between domains that is not in the dependency declaration. If a new direction is needed, propose updating the declaration to the user and confirm it creates no cycle. If it would create a cycle, treat that as a sign the boundary is in the wrong place (see below).

When `app/route.ts` or `shared/store.ts` is growing large:
- `app/route.ts` growing = signal that domain `routes.ts` files are not being used properly.
- `shared/store.ts` growing = signal that DB access should be moved into the appropriate domain `store.ts`.

### Naming, Splitting, and Merging Domains

Domain names and boundaries are domain vocabulary, and the user ratifies them: Kaachan detects, you propose, the user decides. Never create, merge, or rename a domain folder or a `logic/` file without the user's approval.

Every proposal contains:
1. **The candidate groups** — which functions and files go where, and why they belong together.
2. **A name for each group, labeled with its provenance**:
   - **established** — traceable to a word the user actually used, or to a name the user previously approved.
   - **coined** — anything else. Give a one-line definition and expect the user to question it.
   A word that appears only in AI-written docs, comments, or identifiers is NOT established: an AI coinage recorded in a document is still a coinage. Specs and business terms the user brought in count as established; specs written by an AI do not.
3. **A "keep as-is" option** — splitting and merging cost import churn and declaration updates, so leaving the structure alone is a legitimate outcome.

Size thresholds only catch growth. Also watch for the reverse — the current split may be on the wrong axis, or two domains may really be one concern:
- Adding a dependency direction would create a cycle → the boundary is likely in the wrong place.
- The App layer calls the same pair of domains together again and again → they may be one domain.
- A domain folder has very little in it → over-split.
- Business judgment accumulates in `shared/` → a domain that has not been named yet.
- The same set of domains keeps changing together across unrelated commits (check `git log --name-only -- src/domains`) → the split does not follow the real boundary.

When you notice one of these signs, propose a merge or re-cut in the same form as a split. Do this only when a sign appears or the user asks — do not propose reorganizations unprompted. When applying an approved merge or re-cut, also update everything keyed by the domain name: the dependency declaration in `slime.config.ts`, the error code prefixes (`USER_*`), and `routes.ts`.

---

## Next Step: Lv7

To advance to Lv7, introduce:
- `orchestrate/<name>/` folders that take multi-domain coordination out of the App layer (e.g., `orchestrate/order-inventory/`)
- `defer()` for post-commit side effects
- Make logic tests mandatory (Error if missing)

Run `slime level:next` to check what is needed.
