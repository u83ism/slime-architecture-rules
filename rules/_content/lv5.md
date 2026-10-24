# Slime Architecture Rules — Level 5 (Logic Layer)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv5**: business judgment and domain calculations are isolated in `logic.ts`.

---

## Project Structure

```
src/
  route.ts        # HTTP routing only — no business logic
  middleware.ts   # Authentication, rate limiting, CORS, etc.
  workflow.ts     # Request orchestration (parse → logic → store/client → response)
  parse.ts        # Request validation and transformation
  errors.ts       # Error codes this app can return (types only)
  store.ts        # All DB reads and writes
  client.ts       # All external API calls
  logic.ts        # Pure business judgment and domain calculations
  # ↓ Intermediate promotion when logic.ts grows too large (precursor to Lv6 domain split)
  logic/
    user.ts       # userCan* and user calc functions
    order.ts      # orderCan* and order calc functions
```

---

## Layer Rules

### route.ts
- Define HTTP routes only: method, path, middleware attachment, and which workflow handles the request.
- No business logic and no DB access. Response construction is limited to response wrappers (`json(...)`) and thin handlers (see Lv3).
- Middleware is attached **explicitly on each route** — never auto-applied by folder convention.
- Use `route.group({ prefix: '/api' })` to namespace API routes.

```ts
// OK
route.group({ prefix: '/api' }, (r) => {
  r.get('/users/:id', slime.auth(), json(parseGetUser, GetUserWorkflow))
  r.post('/users',    slime.auth(), json(parseCreateUser, CreateUserWorkflow, { status: 201 }))
})
```

- `json(parse, workflow)` runs parse on `{ params, query, body }`, passes the typed input and the principal to the workflow, and returns the result as JSON. Routes without input use `json(workflow)`.
- Thin handlers (HTTP I/O only, e.g., setting cookies) may be written directly in `route.ts`. They must not call store or logic directly.

### middleware.ts
- Middleware is the **HTTP gate**. It has three jobs:
  1. HTTP-specific concerns: CORS, rate limiting, body size limits, webhook signature verification, request logging.
  2. Converting credentials (cookie, bearer token) into a **principal** — a value describing who the request runs as (a user, an external service, the system itself, or anonymous).
  3. Coarse role-based authorization (e.g., "admins only").
- May call `store.ts` / `client.ts` for reads needed by the gate decision (e.g., session lookup). Business judgment is not allowed.
- Must not perform **resource-level authorization** (e.g., "only the author may edit this post"). The workflow loads the resource and `logic.ts` decides (see below).
- Returns standardized error responses on rejection (401, 403, 429, etc.).

### workflow.ts
- Receives typed input and the principal (in that order; the principal may be omitted). Resolves data via `store`/`client`, judges via `logic`, writes, and returns data.
- Must not touch HTTP request, response, or context objects, and must not call parse functions.
- Calls store for data, passes **resolved primitive values** to logic — never passes store functions into logic.
- Returns `Result` errors from logic and client upward with an early `return` — never converts them to `throw` (see Error Handling).
- Must not contain business judgment (belongs in `logic.ts`).
- Must not contain validation logic (belongs in `parse.ts`).
- When multiple store operations must succeed or fail together, use `withTransaction()`.

```ts
// OK — workflow resolves data, then passes primitives to logic
export const CreateUserWorkflow = async (input: CreateUserInput) => {
  const exists = await findUserByEmail(input.email)        // store resolves data
  const check = userCanCreate(!!exists)                    // logic receives primitive
  if (!check.ok) return check                              // rejection returned, not thrown
  return ok(await saveUser({ ...input, id: generateId() }))
}

// OK — resource-level authorization: workflow loads the resource, logic decides
export const UpdatePostWorkflow = async (input: UpdatePostInput, principal: Principal) => {
  const post = await findPostById(input.postId)
  const check = postCanEdit(principal, post)
  if (!check.ok) return check
  return ok(await updatePost(input))
}

// NG — workflow doing business judgment itself
if (exists) throw new Error('USER_ALREADY_EXISTS')  // belongs in logic.ts
```

### parse.ts
- Validates and transforms raw request data (body, params, query) into typed values.
- Must not access DB or external APIs — pure transformation only.
- On validation failure, throw an error that the framework maps to HTTP 400.
- If `parse.ts` grows large (> ~300 lines or ~10 schemas), split into a `parse/` subdirectory by operation.

### store.ts
- All DB reads and writes live here. Workflows must not import ORM/DB modules directly.
- Function naming convention (recommended at Lv4; becomes required Error at Lv6):
  - Reads: `find*` / `list*` / `get*` / `count*` / `search*`
  - Writes: `create*` / `save*` / `update*` / `delete*` / `remove*`
- Must not contain business logic — only data access.
- Must not return ORM types (`Prisma.User`, etc.) — return only plain domain types.

### client.ts
- All external API calls live here. Workflows must not use `fetch`/axios directly.
- Translates external API errors into domain errors (`Result.err`) or re-throws as technical errors.
- Acts as an anti-corruption layer: converts external vocabulary to domain vocabulary.
- Must not make business judgments — only translate external responses.

### logic.ts (new at Lv5)
- **Pure functions only**: no DB access, no external API calls, no side effects.
- Two types of functions are allowed:
  1. **Business judgment**: evaluates a condition and returns `Result<T, DomainErrorCode>`
  2. **Domain calculation/transformation**: computes or formats a value, returns a plain value

- **Naming convention** (enforced by Kaachan): functions must have a domain prefix.
  - `userCan*` / `orderCan*` / `paymentCan*` etc. for business judgments
  - `calcOrder*` / `formatInvoice*` / `applyDiscount*` etc. for calculations

- **Logic never calls store or client**. If you feel the urge to call store inside logic, the workflow's argument design is wrong — the workflow should resolve the data first and pass primitives to logic.

- **Logic must be tested**. Because logic is pure, tests require no mocks. (Failing to test logic becomes a Kaachan Error at Lv7.)

- Business threshold values (e.g., "30 days", "3 retries") belong in logic, not in store or workflow.

- **Resource-level authorization is decided in logic.** The workflow loads the resource, then passes the principal and the resource to a logic function (e.g., `postCanEdit(principal, post)`). Middleware cannot decide this because it runs before the resource is loaded.

```ts
// OK — business judgment (Result type)
export const userCanCreate = (alreadyExists: boolean): Result<void, "USER_ALREADY_EXISTS"> =>
  alreadyExists ? err("USER_ALREADY_EXISTS") : ok(undefined)

// OK — domain calculation (plain return)
export const calcOrderTotal = (items: Item[]): number =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0)

export const applyDiscount = (price: number, coupon: Coupon): number =>
  price * (1 - coupon.rate)

// NG — logic importing store
import { findUserByEmail } from './store'  // not allowed in logic.ts

// NG — missing domain prefix
export const canCreate = ...   // prefix required: userCanCreate, orderCanCreate, etc.

// NG — throwing instead of returning Result
export const userCanCreate = (exists: boolean) => {
  if (exists) throw new Error('exists')  // use Result type instead
}
```

---

## Error Handling

- **Validation failures**: framework returns HTTP 400. **Auth/middleware rejection**: 401, 403, or 429.
- **Business rejections travel as return values all the way to the route.** `logic.ts` and `client.ts` return `Result.err(code)`. The workflow passes it upward with an early `return`. The response wrapper (`json(...)`) maps the code to a 4xx status.
- **Do not throw business rejections** from workflows. `throw new DomainError(...)` was the Lv3–4 style; from Lv5 return `err(...)` instead. `throw` is reserved for technical failures (bugs, DB down, network), which become HTTP 500.
- Workflows that cannot reject may return a plain value.
- `withTransaction()` rolls back when its callback returns `err` (as well as when it throws) and commits on `ok`.
- Every error code needs an HTTP status in the status map. Use `satisfies Record<DomainErrorCode, number>` so a missing entry is a type error.
- Error responses use **Problem Details** (RFC 9457, `Content-Type: application/problem+json`) with a `code` extension member.

```ts
// workflow.ts — rejections are returned, not thrown
export const CreateUserWorkflow = async (input: CreateUserInput): Promise<Result<User, DomainErrorCode>> => {
  const exists = await findUserByEmail(input.email)
  const check = userCanCreate(!!exists)
  if (!check.ok) return check                  // early return — no throw
  return ok(await saveUser(input))
}

// errors.ts — the error codes this app can return
export type DomainErrorCode = "USER_ALREADY_EXISTS" | "OUT_OF_STOCK" | "PAYMENT_DECLINED"

// slime.config.ts — an HTTP status for every code
export default {
  errors: {
    USER_ALREADY_EXISTS: 409,
    OUT_OF_STOCK: 422,
    PAYMENT_DECLINED: 402,
  } satisfies Record<DomainErrorCode, number>,
}
```

```http
HTTP/1.1 409 Conflict
Content-Type: application/problem+json

{ "type": "about:blank", "title": "Conflict", "status": 409, "code": "USER_ALREADY_EXISTS" }
```

---

## General Principles

- **No runtime magic**: routes are always declared explicitly. No file-based auto-routing.
- **No DI container auto-registration**: import and wire dependencies manually.
- **Static over dynamic**: naming conventions are enforced by Kaachan at lint time, not at runtime.
- **Functional Core, Imperative Shell**: logic = pure core, workflow = imperative shell. Keep them separate.

---

## What Kaachan Checks at Lv5

<!-- BEGIN GENERATED: kaachan-checks lv=5 （src/rules-catalog.ts から自動生成。手で編集しない） -->
Severity: 💡 Hint = information, ⚠️ Warning = likely problem, ❌ Error = violates this level's rules.

- ❌ Error — parse imports a DB/ORM module
- ❌ Error — A file in `parse/` exceeds ~300 lines
- ❌ Error — A workflow imports an ORM/DB module directly
- ❌ Error — logic imports store, client, or a DB/ORM module
- ❌ Error — logic throws (return a `Result` instead)
- ❌ Error — A file in `logic/` exceeds ~300 lines or still mixes domain prefixes
- ⚠️ Warning — A route handler does work other than HTTP I/O (store, logic, or DB calls)
- ⚠️ Warning — `workflow.ts` imports an auth library directly (that is middleware's job)
- ⚠️ Warning — `workflow.ts` exceeds ~500 lines
- ⚠️ Warning — A workflow touches HTTP request, response, or context objects
- ⚠️ Warning — A workflow parses raw input directly (e.g., `JSON.parse()`)
- ⚠️ Warning — A workflow throws a plain `Error` (a business rejection would become HTTP 500; use `DomainError` at Lv3–4 and `err()` from Lv5)
- ⚠️ Warning — `parse.ts` exceeds ~500 lines (split into `parse/`)
- ⚠️ Warning — A workflow calls an ORM-specific transaction API directly (use `withTransaction()`)
- ⚠️ Warning — A store function returns an ORM type
- ⚠️ Warning — A logic function has no domain prefix (`userCan*`, etc.)
- ⚠️ Warning — logic has no corresponding test file (`logic.test.ts`)
- ⚠️ Warning — `logic.ts` exceeds ~500 lines, mixes domain prefixes, or contains function groups whose type dependencies do not intersect
- 💡 Hint — API routes are defined outside an `/api` group
- 💡 Hint — `workflow.ts` exceeds ~300 lines or ~10 functions
- 💡 Hint — A workflow calls a parse function (parsing belongs in route)
- 💡 Hint — `slime.config.ts` is missing (it maps error codes to HTTP status codes)
- 💡 Hint — `parse.ts` exceeds ~300 lines or ~10 functions (shared schemas are allowed)
- 💡 Hint — A store function name violates the naming convention (`find*` / `list*` / `get*` / `count*` / `search*` / `create*` / `save*` / `update*` / `delete*` / `remove*`)
- 💡 Hint — `logic.ts` exceeds ~300 lines or ~10 functions (consider splitting into `logic/`)
- 💡 Hint — A workflow throws a `DomainError` (from Lv5, return `err()` up to the route instead)
<!-- END GENERATED -->

---

## Guidance for AI Assistants

When `workflow.ts` or `logic.ts` is approaching the size thresholds above:
1. Propose domain modeling to the user — help articulate what business concepts are present.
2. Identify function groups by domain prefix (e.g., all `user*` functions, all `order*` functions).
3. If type dependencies between function groups do not intersect, suggest them as domain split candidates.
4. Suggest splitting into `logic/user.ts`, `logic/order.ts` as a precursor to Lv6 domain folders.
5. Present the proposal in the form described below, and only proceed with structural changes after user confirmation.
6. Use `slime level:next` to show what Lv6 requires before suggesting the migration.

### Naming, Splitting, and Merging Domains

Domain names and boundaries are domain vocabulary, and the user ratifies them: Kaachan detects, you propose, the user decides. Never create, merge, or rename a `logic/` file without the user's approval.

Every proposal contains:
1. **The candidate groups** — which functions go where, and why they belong together.
2. **A name for each group, labeled with its provenance**:
   - **established** — traceable to a word the user actually used, or to a name the user previously approved.
   - **coined** — anything else. Give a one-line definition and expect the user to question it.
   A word that appears only in AI-written docs, comments, or identifiers is NOT established: an AI coinage recorded in a document is still a coinage. Specs and business terms the user brought in count as established; specs written by an AI do not.
3. **A "keep as-is" option** — splitting and merging cost import churn, so leaving the structure alone is a legitimate outcome.

Size thresholds only catch growth. Also watch for the reverse — the current split may be on the wrong axis, or two groups may really be one concern:
- The same set of `logic/` files keeps changing together across unrelated changes.
- Two `logic/` files call each other's functions or share most of their types.

When you notice one of these signs, propose a merge or re-cut in the same form as a split. Do this only when a sign appears or the user asks — do not propose reorganizations unprompted.

---

## Next Step: Lv6

To advance to Lv6, introduce domain folder separation:
- `app/` — application-level route, workflow, parse, middleware
- `shared/` — shared utilities, small logic, and temporary shared DB access
- `client/` — external API client and adapter (anti-corruption layer)
- `domains/xxx/` — one folder per business domain, each containing its own workflow, store, logic, routes

Run `slime level:next` to check what is needed.
