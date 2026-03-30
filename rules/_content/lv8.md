# Slime Architecture Rules — Level 8 (Shared Events)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv8**: domain event types are centralized in `shared/events.ts`, and `cross-` folders specialize for transactional operations.

---

## Project Structure

```
src/
  app/
    route.ts
    routes/
      api.ts
      web.ts
    workflow.ts     # Receives domain events and passes them to subsequent workflows
    parse.ts
    middleware.ts
  shared/
    utility.ts
    smallLogic.ts
    store.ts
    events.ts       # All domain event type definitions (new at Lv8)
  client/
    client.ts
    adapter.ts
  domainUser/
    routes.ts
    workflow.ts     # Returns a domain event after completing state changes
    logic.ts
    logic.test.ts
    store.ts
  domainOrder/
    routes.ts
    workflow.ts
    logic.ts
    logic.test.ts
    store.ts
  cross-*/          # Specialized for transactional operations (atomic multi-domain writes)
```

---

## shared/events.ts Rules (new at Lv8)

- All domain event type definitions live in `shared/events.ts`.
- Events represent **things that have already happened** — name them as uppercase constant strings with a discriminant `type` field.
- Event types are plain TypeScript types — no class hierarchy, no inheritance.
- Use a `payload` field to carry event data.
- `shared/events.ts` must not import from any domain or `cross-` folder.

```ts
// shared/events.ts

export type UserCreatedEvent = {
  type: "USER_CREATED"
  payload: { userId: string; email: string }
}

export type OrderPlacedEvent = {
  type: "ORDER_PLACED"
  payload: { orderId: string; userId: string; items: OrderItem[] }
}

export type DomainEvent = UserCreatedEvent | OrderPlacedEvent
```

### Emitting and Handling Events

- Domain workflows emit events by **returning them as the workflow's return value** after completing state changes (return-value pattern, not event-bus/emit pattern).
- The app-layer workflow receives the event and explicitly passes it to subsequent workflows or `defer()` calls.
- This keeps event flow visible in code — you can always read `app/workflow.ts` to see the full chain.

```ts
// domainUser/workflow.ts — emitting an event as return value
export const createUserWorkflow = async (input: ValidatedInput): Promise<UserCreatedEvent> => {
  const user = await saveUser(input)
  return { type: "USER_CREATED", payload: { userId: user.id, email: user.email } }
}

// app/workflow.ts — receives event and dispatches downstream
export const CreateUserWorkflow = async (req: Request, res: Response) => {
  const valid = parseCreateUser(req.body)
  const event = await createUserWorkflow(valid)

  await notificationWorkflow(event)             // synchronous important follow-up
  defer(() => analyticsWorkflow(event))         // async, failure-tolerant side effect

  res.status(201).json(event.payload)
}
```

### Why Return-Value Pattern (not event bus)

Using an event bus (`emit`/`on`) hides who is listening and whether handlers are present. In backend domain events, a missing handler is typically a bug. The return-value pattern makes all event routing **explicit and readable in `app/workflow.ts`**, so the full flow is visible without tracing subscriptions.

---

## cross-/ Specialization (new at Lv8)

At Lv8, `cross-` folders become specialized for **transactional operations** — operations that must atomically succeed or fail together across multiple domains.

- `cross-` folders should be used when **`withTransaction()` is required** to maintain consistency across domain boundaries.
- If a `cross-` folder contains no `withTransaction()` usage, Kaachan emits a ⚠️ Warning ("this might be expressible as domain events instead").
- Non-transactional cross-domain side effects (email, notifications, analytics) belong in domain events + `defer()`, not in `cross-` folders.

```ts
// cross-orderInventory/workflow.ts — transactional: atomic order + stock deduction
export const createOrderWithInventory = (input: ValidatedInput) =>
  withTransaction(async () => {
    const event = await orderDomain.createOrder(input)
    await inventoryDomain.deductStock(event.payload.items)  // rollback if this fails
    return event
  })
```

---

## Cross Folder Rules (unchanged from Lv7)

- Cross folders: `cross-[kebab-case]`.
- Domains may import from `cross-` folders; `cross-` may not import from domains or other `cross-` folders.
- `cross-` folders must not import from `app/`.
- `cross-` folders follow the same internal layer rules as domain folders.

---

## Domain Folder Rules (unchanged from Lv6–Lv7)

- Domain folders: `domain[A-Z]camelCase`.
- Domains must not import from each other directly.
- All Lv1–Lv7 layer rules apply within each domain.

### Layer rules within each domain
- `workflow.ts`: orchestrates — calls parse/store/logic — no ORM imports. Returns domain events.
- `logic.ts`: pure functions with domain-prefixed names, `Result` for fallible operations.
- `logic.test.ts`: **mandatory** — missing is ❌ Error.
- `store.ts`: `find*` / `list*` / `get*` / `count*` / `search*` / `create*` / `save*` / `update*` / `delete*` / `remove*` naming; no ORM types in return values.

---

## app/ Rules (unchanged from Lv6–Lv7)

- `app/route.ts` aggregates domain routes only — no inline route definitions.
- `app/routes/api.ts` applies `/api` prefix and delegates to domain routes.
- `app/workflow.ts` receives domain events and coordinates downstream workflows.
- App layer must not contain `logic.ts`, `store.ts`, or direct `client/` calls.

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
- **Event flow is explicit**: event routing lives in `app/workflow.ts` — no hidden subscriptions.

---

## What Kaachan Checks at Lv8

- `shared/events.ts` exists.
- `shared/events.ts` does not import from domain or `cross-` folders.
- Event types have a `type` field with an uppercase constant string (`"USER_CREATED"`, not `"userCreated"`).
- Event types use a `payload` field for event data.
- `cross-` folders with no `withTransaction()` usage → ⚠️ Warning ("consider using domain events + defer() instead").
- `logic.test.ts` missing in any domain or `cross-` folder → ❌ Error.
- All Lv7 checks continue to apply.

---

## Guidance for AI Assistants

When implementing a feature that triggers a reaction in another domain (e.g., "when an order is placed, send a notification"):
1. Define the event type in `shared/events.ts` first (`type: "ORDER_PLACED"` with `payload`).
2. Have the originating domain's workflow return the event after the state change.
3. In `app/workflow.ts`, receive the event and call the notification workflow.
4. If the notification is failure-tolerant, wrap it in `defer()`.
5. Do **not** create a `cross-` folder for this — use domain events + `defer()` instead.

When deciding between domain events and `cross-` folder:
- **Use domain events + defer()**: when the follow-up can fail without rolling back the primary operation (email, notifications, analytics).
- **Use cross- + withTransaction()**: when the follow-up must succeed or fail atomically with the primary operation (stock deduction, balance transfer).

---

## Next Step: Lv9

To advance to Lv9, introduce Ports & Adapters:
- `domainXxx/ports.ts` — interface definitions that the domain depends on
- `infrastructure/` folder — concrete implementations (DB adapters, external service adapters)

Run `slime level:next` to check what is needed.
