# Slime Architecture Rules — Level 2 (Workflow + Middleware)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv2**: routing, workflow orchestration, and middleware are separated into distinct files.

---

## Project Structure

```
src/
  route.ts        # HTTP routing only — no business logic
  workflow.ts     # Request orchestration
  middleware.ts   # Authentication, rate limiting, CORS, etc.
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

// NG — logic or response construction inside route.ts
route.get('/users/:id', async (req, res) => {
  const user = await db.users.find(req.params.id) // wrong layer
  res.json(user)
})
```

### middleware.ts
- Handles cross-cutting concerns: authentication, rate limiting, CORS, request logging.
- Must not contain business logic or DB queries.
- Returns standardized error responses on rejection (401, 403, 429, etc.).

```ts
// OK
export const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  req.user = await verifyToken(token)
  next()
}
```

### workflow.ts
- Orchestrates one request end-to-end: receive input → process → return response.
- Each exported function corresponds to one HTTP operation.
- At Lv2, workflows may contain inline DB calls since `repository.ts` is not yet introduced.
- Must not contain reusable middleware logic (that belongs in `middleware.ts`).
- Keep each workflow function focused on a single operation — avoid a single workflow handling multiple unrelated responsibilities.

```ts
// OK
export const CreateUserWorkflow = async (req: Request, res: Response) => {
  const { email, name } = req.body
  const user = await db.users.create({ email, name })
  res.status(201).json(user)
}
```

---

## Error Handling

- **Auth/middleware rejection**: return 401, 403, 429 from middleware directly.
- **Unhandled throws**: framework maps to HTTP 500.
- Return 4xx errors explicitly with `res.status(4xx).json(...)` when the error is a known business condition.

---

## General Principles

- **No runtime magic**: routes are always declared explicitly. No file-based auto-routing.
- **No DI container auto-registration**: import and wire dependencies manually.
- **Static over dynamic**: naming conventions are enforced by Kaachan at lint time, not at runtime.

---

## Next Step: Lv3

To advance to Lv3, introduce:
- `parse.ts` — request validation and transformation (move all `req.body` parsing out of workflows)

Run `slime level:next` to check what is needed.
