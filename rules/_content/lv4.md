# Slime Architecture Rules — Level 4 (Repository + Client)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv4**: DB access and external API calls are isolated in dedicated files.

---

## Project Structure

```
src/
  route.ts        # HTTP routing only — no business logic
  middleware.ts   # Authentication, rate limiting, CORS, etc.
  workflow.ts     # Request orchestration (calls parse → repository/client → response)
  parse.ts        # Request validation and transformation
  repository.ts   # All DB reads and writes
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
- Orchestrates one request: `parse` → `repository`/`client` → response.
- Calls `repository.ts` for all DB operations. Never accesses DB directly (no ORM imports).
- Calls `client.ts` for all external API operations.
- Must not contain validation logic (belongs in `parse.ts`).
- Must not contain business judgment logic (belongs in `logic.ts`, introduced at Lv5).

```ts
// OK
export const CreateUserWorkflow = async (req: Request, res: Response) => {
  const input = parseCreateUser(req.body)
  const exists = await findUserByEmail(input.email)   // repository
  await saveUser({ ...input, id: generateId() })      // repository
  res.status(201).json({ ok: true })
}

// NG — ORM imported directly in workflow
import { db } from '../db'  // wrong: DB access belongs in repository.ts
```

### parse.ts
- Validates and transforms raw request data (body, params, query) into typed values.
- Must not access DB or external APIs — pure transformation only.
- On validation failure, throw an error that the framework maps to HTTP 400.
- If `parse.ts` grows large (> ~200 lines), split into a `parse/` subdirectory by operation.

### repository.ts (new at Lv4)
- All DB reads and writes live here. Workflows must not import ORM/DB modules directly.
- Function naming convention (enforced by Kaachan):
  - Reads: `find*` / `list*` (e.g., `findUserById`, `listActiveOrders`)
  - Writes: `save*` / `create*` (e.g., `saveUser`, `createOrder`)
- Must not contain business logic or judgment — only data access.
- If `repository.ts` grows large, split into a `repository/` subdirectory by entity.

```ts
// OK
export const findUserByEmail = (email: string): Promise<User | null> => ...
export const saveUser = (user: User): Promise<void> => ...

// NG — wrong naming
export const getUserByEmail = ...   // use find* instead
export const insertUser = ...       // use save* or create* instead

// NG — business logic inside repository
export const findActiveUsers = () =>
  db.users.where({ status: 'active', loginCount: { gt: 0 } }) // threshold belongs in logic
```

### client.ts (new at Lv4)
- All external API calls live here. Workflows must not use `fetch`/axios directly.
- Translates external API errors into domain errors (Result type) or re-throws as technical errors.
- Acts as an anti-corruption layer: converts external vocabulary to domain vocabulary.

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

- `workflow.ts` does not import ORM/DB modules directly (DB access must go through `repository.ts`).
- `repository.ts` function names follow `find*` / `list*` / `save*` / `create*` conventions.
- `parse.ts` does not import from DB/ORM modules.

---

## Next Step: Lv5

To advance to Lv5, introduce:
- `logic.ts` — pure business judgment functions and domain calculations (no DB, no side effects)

Run `slime level:next` to check what is needed.
