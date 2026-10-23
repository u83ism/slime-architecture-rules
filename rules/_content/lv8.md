# Slime Architecture Rules — Level 8 (Shared Events)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv8**: domain event types are centralized in `shared/events.ts`, and `orchestrate-` folders specialize for transactional operations.

---

## Project Structure

```
src/
  app/
    route.ts
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
  orchestrate-*/    # Specialized for transactional operations (atomic multi-domain writes)
```

---

## shared/events.ts Rules (new at Lv8)

- All domain event type definitions live in `shared/events.ts`.
- Events represent **things that have already happened** — name them as uppercase constant strings with a discriminant `type` field.
- Event types are plain TypeScript types — no class hierarchy, no inheritance.
- Use a `payload` field to carry event data.
- `shared/events.ts` must not import from any domain or `orchestrate-` folder.

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
export const CreateUserWorkflow = async (input: CreateUserInput) => {
  const event = await createUserWorkflow(input)

  await notificationWorkflow(event)             // synchronous important follow-up
  defer(() => analyticsWorkflow(event))         // async, failure-tolerant side effect

  return event.payload
}
```

### Why Return-Value Pattern (not event bus)

Using an event bus (`emit`/`on`) hides who is listening and whether handlers are present. In backend domain events, a missing handler is typically a bug. The return-value pattern makes all event routing **explicit and readable in `app/workflow.ts`**, so the full flow is visible without tracing subscriptions.

---

## orchestrate-/ Specialization (new at Lv8)

At Lv8, `orchestrate-` folders become specialized for **transactional operations** — operations that must atomically succeed or fail together across multiple domains.

- `orchestrate-` folders should be used when **`withTransaction()` is required** to maintain consistency across domain boundaries.
- If a `orchestrate-` folder contains no `withTransaction()` usage, Kaachan emits a ⚠️ Warning ("this might be expressible as domain events instead").
- Non-transactional multi-domain side effects (email, notifications, analytics) belong in domain events + `defer()`, not in `orchestrate-` folders.

```ts
// orchestrate-order-inventory/workflow.ts — transactional: atomic order + stock deduction
export const createOrderWithInventory = (input: ValidatedInput) =>
  withTransaction(async () => {
    const event = await orderDomain.createOrder(input)
    await inventoryDomain.deductStock(event.payload.items)  // rollback if this fails
    return event
  })
```

---

## Orchestrate Folder Rules (unchanged from Lv7)

- Orchestrate folders: `orchestrate-[kebab-case]`.
- `orchestrate-` folders may import from domains; domains must not import from `orchestrate-` folders.
- `orchestrate-` folders must not import from each other or from `app/`.

---

## Domain Folder Rules (unchanged from Lv6–Lv7)

- Domain folders: `domain[A-Z]camelCase`.
- Inter-domain imports follow the declared dependency DAG (see Lv6).
- Domains must not import from `orchestrate-` folders.
- All Lv1–Lv7 layer rules apply within each domain.

### Layer rules within each domain
- `workflow.ts`: receives parsed input and the principal — calls store/logic and `client/adapter.ts` — no ORM imports, no HTTP objects. Returns domain events.
- `logic.ts`: pure functions with domain-prefixed names, `Result` for fallible operations. Decides resource-level authorization from the principal and the loaded resource.
- `logic.test.ts`: **mandatory** — missing is ❌ Error.
- `store.ts`: `find*` / `list*` / `get*` / `count*` / `search*` / `create*` / `save*` / `update*` / `delete*` / `remove*` naming; no ORM types in return values.

---

## app/ Rules (unchanged from Lv6–Lv7)

- `app/route.ts` aggregates domain routes only — no inline route definitions.
- `app/workflow.ts` receives domain events and coordinates downstream workflows.
- `app/middleware.ts` is the HTTP gate (see Lv6). Credential checks call the upstream domain (e.g., `domainAuth`).
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

<!-- BEGIN GENERATED: kaachan-checks lv=8 （src/rules-catalog.ts から自動生成。手で編集しない） -->
Severity: 💡 Hint = information, ⚠️ Warning = likely problem, ❌ Error = violates this level's rules.

- ❌ Error — parse imports a DB/ORM module
- ❌ Error — A file in `parse/` exceeds ~300 lines
- ❌ Error — A workflow imports an ORM/DB module directly
- ❌ Error — A store function name violates the naming convention (`find*` / `list*` / `get*` / `count*` / `search*` / `create*` / `save*` / `update*` / `delete*` / `remove*`)
- ❌ Error — A store function returns an ORM type
- ❌ Error — logic imports store, client, or a DB/ORM module
- ❌ Error — logic throws (return a `Result` instead)
- ❌ Error — logic has no corresponding test file (`logic.test.ts`)
- ❌ Error — A file in `logic/` exceeds ~300 lines or still mixes domain prefixes
- ❌ Error — An inter-domain import that is not in the dependency declaration
- ❌ Error — The domain dependency declaration contains a cycle
- ❌ Error — `client/client.ts` is imported directly (bypassing `client/adapter.ts`)
- ❌ Error — `shared/utility.ts` or `shared/smallLogic.ts` has side effects
- ❌ Error — A file in `shared/` is too large
- ❌ Error — The App layer is too large
- ❌ Error — `app/store.ts` exists (the App layer must not own DB access)
- ❌ Error — `app/client.ts` exists (move it to `client/`)
- ❌ Error — The App layer contains logic (`app/logic.ts` or business judgment)
- ❌ Error — A domain imports from an `orchestrate-` folder
- ❌ Error — An `orchestrate-` folder imports from another `orchestrate-` folder
- ❌ Error — An `orchestrate-` folder imports from `app/`
- ❌ Error — `shared/events.ts` imports from a domain or `orchestrate-` folder
- ❌ Error — An event type references a class (events must be plain data)
- ⚠️ Warning — A route handler does work other than HTTP I/O (store, logic, or DB calls)
- ⚠️ Warning — `workflow.ts` imports an auth library directly (that is middleware's job)
- ⚠️ Warning — `workflow.ts` exceeds ~500 lines
- ⚠️ Warning — A workflow touches HTTP request, response, or context objects
- ⚠️ Warning — A workflow parses raw input directly (e.g., `JSON.parse()`)
- ⚠️ Warning — `parse.ts` exceeds ~500 lines (split into `parse/`)
- ⚠️ Warning — A workflow calls an ORM-specific transaction API directly (use `withTransaction()`)
- ⚠️ Warning — A logic function has no domain prefix (`userCan*`, etc.)
- ⚠️ Warning — `logic.ts` exceeds ~500 lines, mixes domain prefixes, or contains function groups whose type dependencies do not intersect
- ⚠️ Warning — `shared/` imports from a domain folder
- ⚠️ Warning — `app/route.ts` defines routes (move them to `domainXxx/routes.ts`)
- ⚠️ Warning — `app/route.ts` is too large
- ⚠️ Warning — A route references a workflow file that does not exist (dead route candidate)
- ⚠️ Warning — A route past its `sunset` date still exists
- ⚠️ Warning — `shared/events.ts` does not exist
- ⚠️ Warning — An event type has no `type` discriminant field
- ⚠️ Warning — An event's `type` value is not UPPER_SNAKE_CASE
- ⚠️ Warning — An `orchestrate-` folder has no `withTransaction()` (domain events + `defer()` may suffice)
- ⚠️ Warning — An `orchestrate-` folder contains non-transactional work (email, external API calls)
- 💡 Hint — API routes are defined outside an `/api` group
- 💡 Hint — `workflow.ts` exceeds ~300 lines or ~10 functions
- 💡 Hint — A workflow calls a parse function (parsing belongs in route)
- 💡 Hint — `parse.ts` exceeds ~300 lines or ~10 functions (shared schemas are allowed)
- 💡 Hint — `logic.ts` exceeds ~300 lines or ~10 functions (consider splitting into `logic/`)
- 💡 Hint — `slime.config.ts` is missing (it maps domain error codes to HTTP status codes)
- 💡 Hint — A workflow is not referenced by any route (unreachable workflow candidate)
- 💡 Hint — A domain folder has no `routes.ts`
- 💡 Hint — Non-DB async work (email, external API calls) inside `withTransaction()` (suggests `defer()`; opt-in)
<!-- END GENERATED -->

---

## Guidance for AI Assistants

When implementing a feature that triggers a reaction in another domain (e.g., "when an order is placed, send a notification"):
1. Define the event type in `shared/events.ts` first (`type: "ORDER_PLACED"` with `payload`).
2. Have the originating domain's workflow return the event after the state change.
3. In `app/workflow.ts`, receive the event and call the notification workflow.
4. If the notification is failure-tolerant, wrap it in `defer()`.
5. Do **not** create a `orchestrate-` folder for this — use domain events + `defer()` instead.

When deciding between domain events and `orchestrate-` folder:
- **Use domain events + defer()**: when the follow-up can fail without rolling back the primary operation (email, notifications, analytics).
- **Use orchestrate- + withTransaction()**: when the follow-up must succeed or fail atomically with the primary operation (stock deduction, balance transfer).

---

## Next Step: Lv9

To advance to Lv9, introduce Ports & Adapters:
- `domainXxx/ports.ts` — interface definitions that the domain depends on
- `infrastructure/` folder — concrete implementations (DB adapters, external service adapters)

Run `slime level:next` to check what is needed.
