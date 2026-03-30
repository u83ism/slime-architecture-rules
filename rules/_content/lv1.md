# Slime Architecture Rules — Level 1 (Routing Only)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv1**: routing only. All request handling lives in a single `route.ts`.

---

## Project Structure

```
src/
  route.ts    # All HTTP routing and request handling
```

---

## Layer Rules

### route.ts
- Define HTTP routes: method, path, and handler.
- At Lv1, inline handlers are acceptable since the project is minimal.
- Avoid adding business logic that belongs in a separate workflow layer — keep handlers short.
- Use `route.group({ prefix: '/api' })` from the start to reserve the `/api` namespace, even if you only have a few routes.

```ts
// OK — simple inline handler at Lv1
route.group({ prefix: '/api' }, (r) => {
  r.get('/health', (req, res) => res.json({ ok: true }))
  r.post('/users', CreateUserHandler)
})
```

---

## Error Handling

- Unhandled throws are caught by the framework and mapped to HTTP 500.
- Return 4xx errors explicitly with `res.status(4xx).json(...)`.

---

## General Principles

- **No runtime magic**: there is no file-based auto-routing. Routes are always declared explicitly.
- **No DI container auto-registration**: import and wire dependencies manually.
- **Static over dynamic**: naming conventions are enforced by Kaachan (static analysis) at lint time, not at runtime.

---

## Next Step: Lv2

To advance to Lv2, separate concerns into:
- `workflow.ts` — request orchestration
- `middleware.ts` — authentication, rate limiting, CORS

Run `slime level:next` to check what is needed.
