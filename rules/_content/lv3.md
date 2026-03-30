# Slime Architecture Rules — Level 3 (Parse Layer)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv3**: request validation and transformation are isolated in `parse.ts`.

---

## Project Structure

```
src/
  route.ts        # HTTP routing only — no business logic
  middleware.ts   # Authentication, rate limiting, CORS, etc.
  workflow.ts     # Request orchestration (calls parse, then DB/external)
  parse.ts        # Request validation and transformation
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
- Orchestrates one request: call `parse` → call repository/client → return response.
- The only layer that coordinates between parse, repository, and client.
- Must not contain validation logic — that belongs in `parse.ts`.
- Must not contain business judgment logic — that belongs in `logic.ts` (introduced at Lv5).

```ts
// OK
export const CreateUserWorkflow = async (req: Request, res: Response) => {
  const input = parseCreateUser(req.body)           // parse layer
  await db.users.create(input)                      // DB (still inline at Lv3)
  res.status(201).json({ ok: true })
}

// NG — validation inside workflow
export const CreateUserWorkflow = async (req: Request, res: Response) => {
  if (!req.body.email) throw new Error('email required') // belongs in parse.ts
  ...
}
```

### parse.ts (new at Lv3)
- Validates and transforms raw request data (body, params, query) into typed values.
- Must not access DB or external APIs — pure transformation only.
- On validation failure, throw an error that the framework maps to HTTP 400.
- If `parse.ts` grows large (> ~300 lines or ~10 schemas), split into a `parse/` subdirectory by operation.

```ts
// OK
export const parseCreateUser = (body: unknown): CreateUserInput => {
  // validate shape, throw on invalid, return typed value
}

// NG — DB access inside parse
export const parseCreateUser = async (body: unknown) => {
  const exists = await db.users.findByEmail(body.email) // wrong layer
}
```

---

## Error Handling

- **Validation failures** (`parse.ts` throws): framework maps to HTTP 400.
- **Auth/middleware rejection**: framework maps to 401, 403, or 429.
- **Unhandled throws**: framework maps to HTTP 500.

---

## General Principles

- **No runtime magic**: routes are always declared explicitly. No file-based auto-routing.
- **No DI container auto-registration**: import and wire dependencies manually.
- **Static over dynamic**: naming conventions are enforced by Kaachan at lint time, not at runtime.

---

## What Kaachan Checks at Lv3

- `parse.ts` does not import from DB/ORM modules.
- `workflow.ts` does not contain raw `req.body` access without going through `parse.ts`.
- `route.ts` does not contain inline handler logic.

---

## Next Step: Lv4

To advance to Lv4, introduce:
- `repository.ts` — all DB reads and writes
- `client.ts` — all external API calls

Run `slime level:next` to check what is needed.
