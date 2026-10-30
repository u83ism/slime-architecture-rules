# Slime Architecture Rules — Level 4 (Store + Client)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv4**: DB access and external API calls are isolated in dedicated files.

---

## Project Structure

```
src/
  route.ts        # HTTP routing only — no business logic
  middleware.ts   # Authentication, rate limiting, CORS, etc.
  workflow.ts     # Request orchestration (calls parse → store/client → response)
  parse.ts        # Request validation and transformation
  errors.ts       # Error codes this app can return (types only)
  store.ts        # All DB reads and writes
  client.ts       # All external API calls
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
- Must not perform **resource-level authorization** (e.g., "only the author may edit this post"). That requires loading the resource first and belongs in the workflow (in `logic.ts` from Lv5).
- Returns standardized error responses on rejection (401, 403, 429, etc.).

### workflow.ts
- Receives typed input and the principal (in that order; the principal may be omitted), calls `store`/`client`, and returns data.
- Must not touch HTTP request, response, or context objects, and must not call parse functions.
- Calls `store.ts` for all DB operations. Never accesses DB directly (no ORM imports).
- Calls `client.ts` for all external API operations.
- Must not contain validation logic (belongs in `parse.ts`).
- Must not contain business judgment logic (belongs in `logic.ts`, introduced at Lv5).
- When multiple store operations must succeed or fail together, use `withTransaction()` — never write ORM-specific transaction API directly in workflow.

```ts
// OK
export const CreateUserWorkflow = async (input: CreateUserInput) => {
  const exists = await findUserByEmail(input.email)      // store
  return await saveUser({ ...input, id: generateId() })  // store
}

// NG — ORM imported directly in workflow
import { db } from '../db'  // wrong: DB access belongs in store.ts

// OK — cross-store transaction via withTransaction()
export const CreateUserWithAuditWorkflow = async (input: CreateUserInput) => {
  return withTransaction(async () => {
    const user = await saveUser(input)
    await saveAuditLog(user.id, 'USER_CREATED')
    return user
  })
}

// NG — ORM transaction API directly in workflow
await prisma.$transaction(async (tx) => { ... })  // belongs in store.ts or via withTransaction()
```

### parse.ts
- Validates and transforms raw request data (body, params, query) into typed values.
- Must not access DB or external APIs — pure transformation only.
- On validation failure, throw an error that the framework maps to HTTP 400.
- If `parse.ts` grows large (> ~300 lines or ~10 schemas), split into a `parse/` subdirectory by operation.

### store.ts (new at Lv4)
- All DB reads and writes live here. Workflows must not import ORM/DB modules directly.
- Function naming convention (recommended at Lv4; becomes required Error at Lv6):
  - Reads: `find*` / `list*` / `get*` / `count*` / `search*`
  - Writes: `create*` / `save*` / `update*` / `delete*` / `remove*`
- Must not contain business logic — only data access.
- **Must not return ORM types** (`Prisma.User`, Drizzle model types, etc.) — return only plain domain types defined in your own codebase.
- **Read functions come in four shapes only** — do not add a new `findByXxx` for every slightly different condition, and do not accept free-form query conditions:
  1. **By ID**: `find*ByIds(ids): Promise<Map<id, T>>` is the primary form. Write the SQL only here; a single-item version may be derived from it. Return a `Map` (results are unordered and may be missing items), and handle empty input and `IN` parameter limits inside it.
  2. **Unique key / lock**: e.g. `findUserByEmail(email)`, or a row-locking read — reads that are inherently one item.
  3. **Filtering**: `list*(filter, page)`, where `filter` is a closed type defined by the store in business terms. All fields are optional, so any combination works — this covers ordinary search forms. When a new condition is needed, add a field to the type — not a new function.
  4. **Condition-tree search**: `search*(query, page)`, for screens where the user composes the condition itself (e.g. an admin "advanced search" builder with AND / OR). `query` is a tree of `{ field, op, value }` nodes combined with `and` / `or`.
- Filter conditions use business vocabulary (`{ status: ["active"], joinedAt: { from } }`). Express IN / range / partial-match as field types. Sort order is an enumerated choice (`"joinedAt" | "name"`), not an arbitrary string.
- **The line is whether the vocabulary is closed, not whether the shape is generic.** In a condition-tree search, `field` and `op` must be unions of literals defined by the store — never `string`. Validate incoming queries in parse (this doubles as a column allow-list and injection protection). The store decides which fields are searchable (e.g. only indexed columns).
- Fuzzy search, facets, or searching very large datasets belong in a search engine (OpenSearch, Meilisearch, etc.), behind `client/` (Lv4–8) or a read-side adapter (Lv10). The `search*(query, page)` shape seen by callers does not change.
- **Must not accept ORM types or query builders as parameters** (`Prisma.UserWhereInput`, etc.) — that lets callers build queries outside the store.
- Business thresholds (e.g., "within 30 days") are computed in logic and passed as filter values, never hard-coded in the store.
- Screen-specific reads with joins or aggregation that do not fit `filter` get a purpose-named function (`listOrdersForDashboard`). Slight similarity between purpose-named functions is acceptable — they are deleted together with their screen.
- **Callers must not call the store inside a loop** (N+1). Fetch in bulk with `find*ByIds` and join in memory.
- If `store.ts` grows large, split into a `store/` subdirectory by entity.

```ts
// Pure domain type (not an ORM type)
type User = { id: string; name: string; email: string }

const toUser = (r: { id: string; name: string; email: string }): User => ({ id: r.id, name: r.name, email: r.email }) // map to pure type

// OK — unique key
export const findUserByEmail = async (email: string): Promise<User | null> => {
  const record = await prisma.user.findUnique({ where: { email } })
  return record ? toUser(record) : null
}

// OK — by ID: the bulk version is primary; SQL lives only here
export const findUsersByIds = async (ids: readonly string[]): Promise<Map<string, User>> => {
  if (ids.length === 0) return new Map()
  const records = await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } } })
  return new Map(records.map((r) => [r.id, toUser(r)]))
}

// OK — single-item version derived from the bulk version
export const findUserById = async (id: string): Promise<User | null> =>
  (await findUsersByIds([id])).get(id) ?? null

// OK — filtering with a closed, business-vocabulary filter type
export type UserFilter = { status?: "active" | "suspended"; tenantId?: string; joinedAfter?: Date }
export const listUsers = async (
  filter: UserFilter,
  page: { limit: number; cursor?: string; orderBy?: "joinedAt" | "name" },
): Promise<User[]> => { /* build the where clause from filter */ }

export const saveUser = async (user: { name: string; email: string }): Promise<User> => {
  const record = await prisma.user.create({ data: user })
  return { id: record.id, name: record.name, email: record.email }
}

// NG — wrong naming
export const getUserByEmail = ...   // use find* instead
export const insertUser = ...       // use save* or create* instead

// NG — returning ORM type
export const findUserByEmail = async (email: string): Promise<Prisma.User | null> => ...
// Prisma.User leaks ORM dependency — return plain { id, name, email } instead

// NG — near-duplicate condition-named functions (add a field to UserFilter instead)
export const findActiveUsersByTenant = ...
export const findActiveUsersByTenantOrderByName = ...

// OK — condition-tree search: generic shape, closed vocabulary
export type UserSearchField = "status" | "tenantId" | "joinedAt" | "name"
export type UserSearchQuery =
  | { and: readonly UserSearchQuery[] }
  | { or: readonly UserSearchQuery[] }
  | { field: UserSearchField; op: "eq" | "in" | "gte" | "lte" | "contains"; value: unknown }
export const searchUsers = async (query: UserSearchQuery, page: Page): Promise<User[]> => { /* translate the tree into a where clause */ }

// NG — accepting ORM query types (lets callers build queries outside the store)
export const listUsersWhere = async (where: Prisma.UserWhereInput) => ...

// NG — open vocabulary (any column, even unindexed or nonexistent ones)
type Condition = { column: string; op: string; value: unknown }

// NG — calling the store inside a loop (N+1)
for (const order of orders) { order.user = await findUserById(order.userId) }
// OK — fetch in bulk, join in memory
const userById = await findUsersByIds(orders.map((o) => o.userId))

// NG — business logic inside store
export const findActiveUsers = () =>
  db.users.where({ status: 'active', loginCount: { gt: 0 } }) // threshold belongs in logic
```

### client.ts (new at Lv4)
- All external API calls live here. Workflows must not use `fetch`/axios directly.
- Translates external API errors into domain errors (Result type) or re-throws as technical errors.
- Acts as an anti-corruption layer: converts external vocabulary to domain vocabulary.
- Must not make business judgments — only translate external responses.

```ts
// OK
export const chargePayment = async (amount: number): Promise<Result<Receipt, "PAYMENT_DECLINED">> => {
  try {
    const res = await stripeClient.charge(amount)
    return ok(mapToReceipt(res))
  } catch (e) {
    if (e.code === 'card_declined') return err("PAYMENT_DECLINED") // domain error
    throw e  // technical error → 500
  }
}

// NG — business judgment inside client
if (e.code === 'card_declined' && user.retryCount > 3) return err("CARD_BLOCKED")
// threshold judgment ("more than 3 times") belongs in logic.ts
```

---

## Error Handling

- **Validation failures** (`parse.ts` throws): framework returns HTTP 400.
- **Auth/middleware rejection**: framework returns 401, 403, or 429.
- **Business rejections** (e.g., "this email is already registered"): throw a typed `DomainError` with a code declared in `errors.ts`. The response wrapper maps the code to a 4xx status.
- **Business rejections from external APIs**: `client.ts` returns `Result.err(code)` (e.g., `PAYMENT_DECLINED`). Until Lv5, the workflow throws it as a `DomainError`.
- **Unhandled throws** (bugs, DB down, network failure): framework returns HTTP 500. Never use a plain `Error` for a business rejection — it becomes a 500.
- Every error code needs an HTTP status in the status map. Use `satisfies Record<DomainErrorCode, number>` so a missing entry is a type error.
- Error responses use **Problem Details** (RFC 9457, `Content-Type: application/problem+json`) with a `code` extension member.

```ts
// errors.ts — the error codes this app can return
export type DomainErrorCode = "USER_ALREADY_EXISTS" | "PAYMENT_DECLINED"

// slime.config.ts — an HTTP status for every code
export default {
  errors: {
    USER_ALREADY_EXISTS: 409,
    PAYMENT_DECLINED: 402,
  } satisfies Record<DomainErrorCode, number>,
}

// workflow.ts
const payment = await chargePayment(amount)                // client returns Result
if (!payment.ok) throw new DomainError(payment.error)      // OK until Lv5
if (exists) throw new Error("USER_ALREADY_EXISTS")         // NG — a plain Error becomes 500
```

From Lv5, business rejections are returned as `Result.err` instead of thrown.

---

## General Principles

- **No runtime magic**: routes are always declared explicitly. No file-based auto-routing.
- **No DI container auto-registration**: import and wire dependencies manually.
- **Static over dynamic**: naming conventions are enforced by Kaachan at lint time, not at runtime.

---

## What Kaachan Checks at Lv4

<!-- BEGIN GENERATED: kaachan-checks lv=4 （src/rules-catalog.ts から自動生成。手で編集しない） -->
Severity: 💡 Hint = information, ⚠️ Warning = likely problem, ❌ Error = violates this level's rules.

- ❌ Error — parse imports a DB/ORM module
- ❌ Error — A file in `parse/` exceeds ~300 lines
- ❌ Error — A workflow imports an ORM/DB module directly
- ⚠️ Warning — A route handler does work other than HTTP I/O (store, logic, or DB calls)
- ⚠️ Warning — `workflow.ts` imports an auth library directly (that is middleware's job)
- ⚠️ Warning — `workflow.ts` exceeds ~500 lines
- ⚠️ Warning — A workflow touches HTTP request, response, or context objects
- ⚠️ Warning — A workflow parses raw input directly (e.g., `JSON.parse()`)
- ⚠️ Warning — A workflow throws a plain `Error` (a business rejection would become HTTP 500; use `DomainError` at Lv3–4 and `err()` from Lv5)
- ⚠️ Warning — `parse.ts` exceeds ~500 lines (split into `parse/`)
- ⚠️ Warning — A workflow calls an ORM-specific transaction API directly (use `withTransaction()`)
- ⚠️ Warning — A store function returns an ORM type
- ⚠️ Warning — A store function takes an ORM type or query builder as a parameter (lets callers build queries outside the store)
- 💡 Hint — API routes are defined outside an `/api` group
- 💡 Hint — `workflow.ts` exceeds ~300 lines or ~10 functions
- 💡 Hint — A workflow calls a parse function (parsing belongs in route)
- 💡 Hint — `slime.config.ts` is missing (it maps error codes to HTTP status codes)
- 💡 Hint — `parse.ts` exceeds ~300 lines or ~10 functions (shared schemas are allowed)
- 💡 Hint — A store function name violates the naming convention (`find*` / `list*` / `get*` / `count*` / `search*` / `create*` / `save*` / `update*` / `delete*` / `remove*`)
- 💡 Hint — A store filter or search query has column names or operators typed as open types such as `string` (use a union of literals defined by the store)
- 💡 Hint — A store function is called inside a loop (`for` / `forEach` / `map`, etc.), which can cause N+1 queries (add a batch function to the store)
<!-- END GENERATED -->

---

## Next Step: Lv5

To advance to Lv5, introduce:
- `logic.ts` — pure business judgment functions and domain calculations (no DB, no side effects)

Run `slime level:next` to check what is needed.
