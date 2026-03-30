# Slime Architecture Rules — Level 5 (Logic Layer)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv5**: business judgment and domain calculations are isolated in `logic.ts`.

---

## Project Structure

```
src/
  route.ts        # HTTP routing only — no business logic
  middleware.ts   # Authentication, rate limiting, CORS, etc.
  workflow.ts     # Request orchestration (parse → logic → repository/client → response)
  parse.ts        # Request validation and transformation
  repository.ts   # All DB reads and writes
  client.ts       # All external API calls
  logic.ts        # Pure business judgment and domain calculations
```

---

## Layer Rules

### route.ts
- Define HTTP routes only: method, path, middleware attachment, and which workflow handles the request.
- No business logic, no DB access, no response construction here.
- Middleware is attached **explicitly on each route** — never auto-applied by folder convention.
- Use `route.group({ prefix: '/api' })` to namespace API routes.

```ts
// OK
route.group({ prefix: '/api' }, (r) => {
  r.get('/users/:id', slime.auth(), GetUserWorkflow)
  r.post('/users',    slime.auth(), CreateUserWorkflow)
})
```

### middleware.ts
- Handles cross-cutting concerns: authentication, rate limiting, CORS, request logging.
- Must not contain business logic or DB queries.
- Returns standardized error responses on rejection (401, 403, 429, etc.).

### workflow.ts
- Orchestrates one request: `parse` → `logic` → `repository`/`client` → response.
- Calls repository for data, passes **resolved primitive values** to logic — never passes repository functions into logic.
- Handles `Result` errors from logic and client, converting them to `throw new Error(errorCode)`.
- Must not contain business judgment (belongs in `logic.ts`).
- Must not contain validation logic (belongs in `parse.ts`).

```ts
// OK — workflow resolves data, then passes primitives to logic
export const CreateUserWorkflow = async (req: Request, res: Response) => {
  const input = parseCreateUser(req.body)
  const exists = await findUserByEmail(input.email)        // repository resolves data
  const check = userCanCreate(!!exists)                    // logic receives primitive
  if (!check.ok) throw new Error(check.error)
  await saveUser({ ...input, id: generateId() })
  res.status(201).json({ ok: true })
}

// NG — workflow doing business judgment itself
if (exists) throw new Error('USER_ALREADY_EXISTS')  // belongs in logic.ts
```

### parse.ts
- Validates and transforms raw request data (body, params, query) into typed values.
- Must not access DB or external APIs — pure transformation only.
- On validation failure, throw an error that the framework maps to HTTP 400.
- If `parse.ts` grows large (> ~200 lines), split into a `parse/` subdirectory by operation.

### repository.ts
- All DB reads and writes live here. Workflows must not import ORM/DB modules directly.
- Function naming convention (enforced by Kaachan):
  - Reads: `find*` / `list*`
  - Writes: `save*` / `create*`
- Must not contain business logic — only data access.

### client.ts
- All external API calls live here. Workflows must not use `fetch`/axios directly.
- Translates external API errors into domain errors (`Result.err`) or re-throws as technical errors.
- Acts as an anti-corruption layer: converts external vocabulary to domain vocabulary.
- Must not make business judgments — only translate external responses.

### logic.ts (new at Lv5)
- **Pure functions only**: no DB access, no external API calls, no side effects.
- Two types of functions are allowed:
  1. **Business judgment**: evaluates a condition and returns `Result<T, DomainError>`
  2. **Domain calculation/transformation**: computes or formats a value, returns a plain value

- **Naming convention** (enforced by Kaachan): functions must have a domain prefix.
  - `userCan*` / `orderCan*` / `paymentCan*` etc. for business judgments
  - `calcOrder*` / `formatInvoice*` / `applyDiscount*` etc. for calculations

- **Logic never calls repository or client**. If you feel the urge to call a repository inside logic, the workflow's argument design is wrong — the workflow should resolve the data first and pass primitives to logic.

- **Logic must be tested**. Because logic is pure, tests require no mocks.

- Business threshold values (e.g., "30 days", "3 retries") belong in logic, not in repository or workflow.

```ts
// OK — business judgment (Result type)
export const userCanCreate = (alreadyExists: boolean): Result<void, "USER_ALREADY_EXISTS"> =>
  alreadyExists ? err("USER_ALREADY_EXISTS") : ok(undefined)

// OK — domain calculation (plain return)
export const calcOrderTotal = (items: Item[]): number =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0)

export const applyDiscount = (price: number, coupon: Coupon): number =>
  price * (1 - coupon.rate)

// NG — logic importing repository
import { findUserByEmail } from './repository'  // not allowed in logic.ts

// NG — missing domain prefix
export const canCreate = ...   // prefix required: userCanCreate, orderCanCreate, etc.

// NG — throwing instead of returning Result
export const userCanCreate = (exists: boolean) => {
  if (exists) throw new Error('exists')  // use Result type instead
}
```

---

## Error Handling

Configure `slime.config.ts` to map domain error codes to HTTP status codes:

```ts
// slime.config.ts
export default {
  errors: {
    USER_ALREADY_EXISTS: 409,
    UNAUTHORIZED: 403,
    OUT_OF_STOCK: 422,
    NOT_FOUND: 404,
    PAYMENT_DECLINED: 402,
    // unlisted throws → automatic 500
  }
}
```

- **Validation failures** (`parse.ts` throws): framework maps to HTTP 400.
- **Auth/middleware rejection**: framework maps to 401, 403, or 429.
- **Domain errors** (`Result.err` from logic or client → `throw new Error(code)`): framework maps via error map to 4xx.
- **Unhandled throws**: framework maps to HTTP 500.

---

## General Principles

- **No runtime magic**: routes are always declared explicitly. No file-based auto-routing.
- **No DI container auto-registration**: import and wire dependencies manually.
- **Static over dynamic**: naming conventions are enforced by Kaachan at lint time, not at runtime.
- **Functional Core, Imperative Shell**: logic = pure core, workflow = imperative shell. Keep them separate.

---

## What Kaachan Checks at Lv5

- `logic.ts` does not import from `repository.ts`, `client.ts`, or any DB/ORM module.
- Logic function names have a domain prefix (`userCan*`, `orderCan*`, `calcOrder*`, etc.).
- Logic functions that can fail return `Result` type — not `throw`.
- `workflow.ts` does not import ORM/DB modules directly.
- `repository.ts` function names follow `find*` / `list*` / `save*` / `create*` conventions.
- If `logic.ts` exceeds ~300 lines or ~10 functions, Kaachan emits a 💡 Hint to consider splitting into `logic/`.
- If `logic.ts` exceeds ~500 lines or mixes domain prefixes, Kaachan emits a ⚠️ Warning.

---

## Guidance for AI Assistants

When `workflow.ts` or `logic.ts` is approaching the size thresholds above:
1. Propose domain modeling to the user — help articulate what business concepts are present.
2. Identify function groups by domain prefix (e.g., all `user*` functions, all `order*` functions).
3. Suggest splitting into `logic/user.ts`, `logic/order.ts` as a precursor to Lv6 domain folders.
4. Only proceed with structural changes after user confirmation.
5. Use `slime level:next` to show what Lv6 requires before suggesting the migration.

---

## Next Step: Lv6

To advance to Lv6, introduce domain folder separation:
- `app/` — application-level route, workflow, parse, middleware
- `shared/` — shared types and utilities
- `domainXxx/` — one folder per business domain, each containing its own workflow, repository, logic

Run `slime level:next` to check what is needed.
