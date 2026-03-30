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
  store.ts        # All DB reads and writes
  client.ts       # All external API calls
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
- Orchestrates one request: `parse` → `store`/`client` → response.
- Calls `store.ts` for all DB operations. Never accesses DB directly (no ORM imports).
- Calls `client.ts` for all external API operations.
- Must not contain validation logic (belongs in `parse.ts`).
- Must not contain business judgment logic (belongs in `logic.ts`, introduced at Lv5).
- When multiple store operations must succeed or fail together, use `withTransaction()` — never write ORM-specific transaction API directly in workflow.

```ts
// OK
export const CreateUserWorkflow = async (req: Request, res: Response) => {
  const input = parseCreateUser(req.body)
  const exists = await findUserByEmail(input.email)   // store
  await saveUser({ ...input, id: generateId() })      // store
  res.status(201).json({ ok: true })
}

// NG — ORM imported directly in workflow
import { db } from '../db'  // wrong: DB access belongs in store.ts

// OK — cross-store transaction via withTransaction()
export const CreateUserWithAuditWorkflow = async (req: Request, res: Response) => {
  const input = parseCreateUser(req.body)
  await withTransaction(async () => {
    const user = await saveUser(input)
    await saveAuditLog(user.id, 'USER_CREATED')
  })
  res.status(201).json({ ok: true })
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
- If `store.ts` grows large, split into a `store/` subdirectory by entity.

```ts
// Pure domain type (not an ORM type)
type User = { id: string; name: string; email: string }

// OK
export const findUserByEmail = async (email: string): Promise<User | null> => {
  const record = await prisma.user.findUnique({ where: { email } })
  if (!record) return null
  return { id: record.id, name: record.name, email: record.email } // map to pure type
}

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

- **Validation failures** (`parse.ts` throws): framework maps to HTTP 400.
- **Auth/middleware rejection**: framework maps to 401, 403, or 429.
- **Domain errors from client** (`Result.err`): workflow converts to `throw new Error(errorCode)` → framework maps via `slime.config.ts` error map to 4xx.
- **Unhandled throws**: framework maps to HTTP 500.

---

## General Principles

- **No runtime magic**: routes are always declared explicitly. No file-based auto-routing.
- **No DI container auto-registration**: import and wire dependencies manually.
- **Static over dynamic**: naming conventions are enforced by Kaachan at lint time, not at runtime.

---

## What Kaachan Checks at Lv4

- `workflow.ts` does not import ORM/DB modules directly (DB access must go through `store.ts`).
- `store.ts` function names follow `find*` / `list*` / `get*` / `count*` / `search*` / `create*` / `save*` / `update*` / `delete*` / `remove*` conventions (💡 Hint at Lv4).
- `store.ts` does not use ORM types as return types.
- `parse.ts` does not import from DB/ORM modules.

---

## Next Step: Lv5

To advance to Lv5, introduce:
- `logic.ts` — pure business judgment functions and domain calculations (no DB, no side effects)

Run `slime level:next` to check what is needed.
