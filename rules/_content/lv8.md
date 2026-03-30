# Slime Architecture Rules — Level 8 (Shared Events)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv8**: domain event types are centralized in `shared/events.ts`.

---

## Project Structure

```
src/
  app/
    route.ts
    routes/
      api.ts
      web.ts
    workflow.ts
    parse.ts
    middleware.ts
  shared/
    events.ts         # All domain event type definitions
  domainUser/
    workflow.ts
    parse.ts
    repository.ts
    client.ts
    logic.ts
    routes.ts
  domainOrder/
    workflow.ts
    parse.ts
    repository.ts
    client.ts
    logic.ts
    routes.ts
  cross-auth/
    logic.ts
    repository.ts
    client.ts
  cross-notification/
    client.ts
    logic.ts
```

---

## shared/events.ts Rules (new at Lv8)

- All domain event type definitions live in `shared/events.ts`.
- Events represent **things that have already happened** — name them in past tense.
- Event types are plain TypeScript types or interfaces — no class hierarchy, no inheritance.
- `shared/events.ts` must not import from any domain or `cross-` folder.

```ts
// shared/events.ts

export type UserCreated = {
  type: 'UserCreated'
  userId: string
  email: string
  occurredAt: Date
}

export type OrderPlaced = {
  type: 'OrderPlaced'
  orderId: string
  userId: string
  totalAmount: number
  occurredAt: Date
}

export type DomainEvent = UserCreated | OrderPlaced
```

### Emitting and Handling Events

- Domain workflows emit events by returning or publishing them after completing state changes.
- Event handlers live in the domain or `cross-` folder that is responsible for the reaction.
- The event bus / pub-sub mechanism is infrastructure — it must not bleed into domain logic.

```ts
// domainUser/workflow.ts — emitting an event
export const CreateUserWorkflow = async (req: Request, res: Response) => {
  const input = parseCreateUser(req.body)
  const exists = await findUserByEmail(input.email)
  const check = userCanCreate(!!exists)
  if (!check.ok) throw new Error(check.error)
  const user = await saveUser({ ...input, id: generateId() })
  await eventBus.publish({ type: 'UserCreated', userId: user.id, email: user.email, occurredAt: new Date() })
  res.status(201).json({ id: user.id })
}
```

---

## Cross Folder Rules (unchanged from Lv7)

- Cross folders: `cross-[kebab-case]`.
- Domains may import from `cross-` folders; `cross-` may not import from domains or other `cross-` folders.
- `cross-` folders follow the same internal layer rules as domain folders.

---

## Domain Folder Rules (unchanged from Lv6–Lv7)

- Domain folders: `domain[A-Z]camelCase`.
- Domains must not import from each other directly.
- All Lv1–Lv7 layer rules apply within each domain.

### Layer rules within each domain
- `workflow.ts`: orchestrates — calls parse/repository/client/logic — no ORM imports.
- `parse.ts`: pure transformation — no DB access.
- `repository.ts`: `find*` / `list*` / `save*` / `create*` naming.
- `client.ts`: anti-corruption layer for external APIs.
- `logic.ts`: pure functions with domain-prefixed names, `Result` for fallible operations.

---

## Error Handling

```ts
// slime.config.ts
export default {
  errors: {
    USER_ALREADY_EXISTS: 409,
    UNAUTHORIZED: 403,
    FORBIDDEN: 403,
    OUT_OF_STOCK: 422,
    NOT_FOUND: 404,
    PAYMENT_DECLINED: 402,
  }
}
```

- **Validation failures**: framework maps to HTTP 400.
- **Auth/middleware rejection**: framework maps to 401, 403, or 429.
- **Domain errors**: `throw new Error(code)` → framework maps via error config to 4xx.
- **Unhandled throws**: framework maps to HTTP 500.

---

## General Principles

- **No runtime magic**: routes are always declared explicitly. No file-based auto-routing.
- **No DI container auto-registration**: import and wire dependencies manually.
- **Static over dynamic**: naming conventions are enforced by Kaachan at lint time, not at runtime.
- **Functional Core, Imperative Shell**: logic = pure core, workflow = imperative shell.
- **Events are types, not classes**: domain events are plain data, not class instances with behavior.

---

## What Kaachan Checks at Lv8

- `shared/events.ts` exists.
- `shared/events.ts` does not import from domain or `cross-` folders.
- Event type names are in past tense (e.g., `UserCreated`, not `CreateUser`).
- All Lv7 checks continue to apply.

---

## Guidance for AI Assistants

When implementing a feature that triggers a reaction in another domain (e.g., "when an order is placed, send a notification"):
1. Define the event type in `shared/events.ts` first.
2. Emit the event from the originating domain's workflow after the state change.
3. Place the reaction handler in the appropriate `cross-` folder or receiving domain.
4. Do **not** add a direct import from the originating domain to the reacting domain — use the event instead.
5. Keep event types minimal: include only the data the handler needs.

---

## Next Step: Lv9

To advance to Lv9, introduce Ports & Adapters:
- `infrastructure/` folder — infrastructure implementations (DB adapters, external service adapters)
- `ports.ts` in each domain folder — interface definitions that the domain depends on

Run `slime level:next` to check what is needed.
