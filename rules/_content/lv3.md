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
- No business logic and no DB access. Response construction is limited to response wrappers (`json(...)`) and thin handlers (see below).
- Middleware is attached **explicitly on each route** — never auto-applied by folder convention.
- Use `route.group({ prefix: '/api' })` to namespace API routes.

```ts
// OK
route.group({ prefix: '/api' }, (r) => {
  r.get('/users',     slime.auth(), json(ListUsersWorkflow))
  r.get('/users/:id', slime.auth(), json(parseGetUser, GetUserWorkflow))
  r.post('/users',    slime.auth(), json(parseCreateUser, CreateUserWorkflow, { status: 201 }))
})
```

- From Lv3, **route.ts combines parse and workflow**. A response wrapper such as `json(parse, workflow)` runs the parse function on `{ params, query, body }`, passes the typed input and the principal established by middleware to the workflow, and returns the workflow's result as JSON.
- Routes without input omit the parse function: `json(workflow)`. Other response wrappers: `stream`, `html`, `sse`.
- Slime FW is expected to provide these wrappers. On Hono or Express, write equivalent helpers yourself.
- Routes that need HTTP-specific operations (setting cookies, redirects) may use a **thin handler** written directly in `route.ts`. A thin handler may only do HTTP I/O: read the context, call parse, call the workflow, and set cookies, headers, or status. It must not call store or logic directly.

```ts
// Thin handler — login needs to set a cookie
r.post('/login', async (c) => {
  const session = await LoginWorkflow(parseLogin({ body: await c.req.json() }), anonymous)
  setCookie(c, 'sid', session.id)
  return c.json({ ok: true })
})
```

### middleware.ts
- Middleware is the **HTTP gate**. It has three jobs:
  1. HTTP-specific concerns: CORS, rate limiting, body size limits, webhook signature verification, request logging.
  2. Converting credentials (cookie, bearer token) into a **principal** — a value describing who the request runs as (a user, an external service, the system itself, or anonymous). This is the same shape as `parse.ts`: raw input in, typed value out.
  3. Coarse role-based authorization (e.g., "admins only").
- Reads needed for the gate decision (e.g., session lookup) are allowed. Business judgment is not.
- Must not perform **resource-level authorization** (e.g., "only the author may edit this post"). That requires loading the resource first and belongs in the workflow (in `logic.ts` from Lv5).
- Returns standardized error responses on rejection (401, 403, 429, etc.).

### workflow.ts
- Receives **typed input and the principal**, in that order, and returns data. Workflows that do not need the principal may omit the second parameter.
- Must not touch HTTP request, response, or context objects. The workflow does not know HTTP, so the same workflow can be called from batch jobs, queues, cron, and tests. Entry points without a user (e.g., cron) pass a system principal.
- Must not call parse functions — parsing happens in `route.ts`.
- Must not contain validation logic — that belongs in `parse.ts`.
- Must not contain business judgment logic — that belongs in `logic.ts` (introduced at Lv5).

```ts
// OK
export const CreateUserWorkflow = async (input: CreateUserInput) => {
  return await db.users.create(input)                // DB (still inline at Lv3)
}

// NG — workflow touching HTTP
export const CreateUserWorkflow = async (req: Request, res: Response) => {
  const input = parseCreateUser(req.body)            // parse belongs in route.ts
  res.status(201).json(await db.users.create(input)) // response belongs in route.ts
}
```

Principal shape (example):

```ts
type Principal =
  | { kind: "user"; userId: string; roles: readonly string[] }
  | { kind: "service"; clientId: string }
  | { kind: "system"; job: string }   // cron, queue workers
  | { kind: "anonymous" }
```

### parse.ts (new at Lv3)
- Validates and transforms raw request data (body, params, query) into typed values.
- Receives `{ params, query, body }` from the response wrapper and returns one typed input.
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
- `workflow.ts` does not touch HTTP request, response, or context objects (⚠️ Warning).
- `workflow.ts` does not call parse functions — parsing belongs in `route.ts` (💡 Hint).
- `route.ts` handlers do only HTTP I/O — no store, logic, or DB calls (⚠️ Warning).

---

## Next Step: Lv4

To advance to Lv4, introduce:
- `repository.ts` — all DB reads and writes
- `client.ts` — all external API calls

Run `slime level:next` to check what is needed.
