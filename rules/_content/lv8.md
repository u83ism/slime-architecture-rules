# Slime Architecture Rules — Level 8 (Shared Events)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv8**: domain event types are centralized in `shared/events.ts`, and `orchestrate/` folders specialize for transactional operations.

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
  domains/user/
    routes.ts
    workflow.ts     # Returns a domain event after completing state changes
    logic.ts
    logic.test.ts
    store.ts
  domains/order/
    routes.ts
    workflow.ts
    logic.ts
    logic.test.ts
    store.ts
  orchestrate/*/    # Specialized for transactional operations (atomic multi-domain writes)
```

---

## shared/events.ts Rules (new at Lv8)

- All domain event type definitions live in `shared/events.ts`.
- Events represent **things that have already happened** — name them as uppercase constant strings with a discriminant `type` field.
- Event types are plain TypeScript types — no class hierarchy, no inheritance.
- Use a `payload` field to carry event data.
- `shared/events.ts` must not import from any domain or `orchestrate/` folder.

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
// domains/user/workflow.ts — emitting an event as return value
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

## orchestrate/ Specialization (new at Lv8)

At Lv8, `orchestrate/` folders become specialized for **transactional operations** — operations that must atomically succeed or fail together across multiple domains.

- `orchestrate/` folders should be used when **`withTransaction()` is required** to maintain consistency across domain boundaries.
- If a `orchestrate/` folder contains no `withTransaction()` usage, Kaachan emits a ⚠️ Warning ("this might be expressible as domain events instead").
- Non-transactional multi-domain side effects (email, notifications, analytics) belong in domain events + `defer()`, not in `orchestrate/` folders.

```ts
// orchestrate/order-inventory/workflow.ts — transactional: atomic order + stock deduction
export const createOrderWithInventory = (input: ValidatedInput) =>
  withTransaction(async () => {
    const placed = await orderDomain.createOrder(input)
    if (!placed.ok) return placed                            // err → transaction rolls back
    const deducted = await inventoryDomain.deductStock(placed.value.payload.items)
    if (!deducted.ok) return deducted                        // e.g. ORDER_OUT_OF_STOCK → rolls back
    return placed
  })
```

---

## Orchestrate Folder Rules (unchanged from Lv7)

- Orchestrate folders: `orchestrate/[kebab-case]`.
- `orchestrate/` folders may import from domains; domains must not import from `orchestrate/` folders.
- `orchestrate/` folders must not import from each other or from `app/`.

---

## Domain Folder Rules (unchanged from Lv6–Lv7)

- Domain folders: `domains/<kebab-case>/`.
- Inter-domain imports follow the declared dependency DAG (see Lv6).
- Domains must not import from `orchestrate/` folders.
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
- `app/middleware.ts` is the HTTP gate (see Lv6). Credential checks call the upstream domain (e.g., `domains/auth`).
- App layer must not contain `logic.ts`, `store.ts`, or direct `client/` calls.

---

## Error Handling

- **Validation failures**: framework returns HTTP 400. **Auth/middleware rejection**: 401, 403, or 429.
- **Business rejections travel as return values all the way to the route.** Domain `logic.ts` and `client/adapter.ts` return `Result.err(code)`. Workflows (domain, `orchestrate/`, and app) pass it upward with an early `return`. The response wrapper (`json(...)`) maps the code to a 4xx status.
- **Do not throw business rejections** from workflows — return `err(...)`. `throw` is reserved for technical failures (bugs, DB down, network), which become HTTP 500.
- Workflows that cannot reject may return a plain value.
- `withTransaction()` rolls back when its callback returns `err` (as well as when it throws) and commits on `ok`.
- **Each domain declares its own error codes** in `domains/xxx/errors.ts`, prefixed with the domain name (`domains/user` → `USER_*`). Domains know nothing about HTTP status codes.
- The status map lives outside the domains (`slime.config.ts`) and must cover the union of all domain codes. Use `satisfies Record<DomainErrorCode, number>` so a missing entry is a type error.
- Error responses use **Problem Details** (RFC 9457, `Content-Type: application/problem+json`) with a `code` extension member. Frontends may `import type` the code union to keep their message tables exhaustive.

```ts
// domains/user/errors.ts — codes only, no HTTP knowledge
export type UserErrorCode = "USER_ALREADY_EXISTS" | "USER_NOT_FOUND"

// slime.config.ts — an HTTP status for every code of every domain
type DomainErrorCode = UserErrorCode | OrderErrorCode
export default {
  errors: {
    USER_ALREADY_EXISTS: 409,
    USER_NOT_FOUND: 404,
    ORDER_OUT_OF_STOCK: 422,
  } satisfies Record<DomainErrorCode, number>,
}

// domains/user/workflow.ts — rejections are returned, not thrown
export const createUserWorkflow = async (input: CreateUserInput): Promise<Result<User, UserErrorCode>> => {
  const exists = await findUserByEmail(input.email)
  const check = userCanCreate(!!exists)
  if (!check.ok) return check
  return ok(await saveUser(input))
}
```

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
- ❌ Error — A domain imports from an `orchestrate/` folder
- ❌ Error — An `orchestrate/` folder imports from another `orchestrate/` folder
- ❌ Error — An `orchestrate/` folder imports from `app/`
- ❌ Error — `shared/events.ts` imports from a domain or `orchestrate/` folder
- ❌ Error — An event type references a class (events must be plain data)
- ⚠️ Warning — A route handler does work other than HTTP I/O (store, logic, or DB calls)
- ⚠️ Warning — `workflow.ts` imports an auth library directly (that is middleware's job)
- ⚠️ Warning — `workflow.ts` exceeds ~500 lines
- ⚠️ Warning — A workflow touches HTTP request, response, or context objects
- ⚠️ Warning — A workflow parses raw input directly (e.g., `JSON.parse()`)
- ⚠️ Warning — A workflow throws a plain `Error` (a business rejection would become HTTP 500; use `DomainError` at Lv3–4 and `err()` from Lv5)
- ⚠️ Warning — `parse.ts` exceeds ~500 lines (split into `parse/`)
- ⚠️ Warning — A workflow calls an ORM-specific transaction API directly (use `withTransaction()`)
- ⚠️ Warning — A logic function has no domain prefix (`userCan*`, etc.)
- ⚠️ Warning — `logic.ts` exceeds ~500 lines, mixes domain prefixes, or contains function groups whose type dependencies do not intersect
- ⚠️ Warning — A workflow throws a `DomainError` (from Lv5, return `err()` up to the route instead)
- ⚠️ Warning — A folder directly under `domains/` or `orchestrate/` is not named in kebab-case
- ⚠️ Warning — A domain error code lacks the domain prefix (`domains/user` → `USER_*`)
- ⚠️ Warning — `shared/` imports from a domain folder
- ⚠️ Warning — `app/route.ts` defines routes (move them to `domains/xxx/routes.ts`)
- ⚠️ Warning — `app/route.ts` is too large
- ⚠️ Warning — A route references a workflow file that does not exist (dead route candidate)
- ⚠️ Warning — A route past its `sunset` date still exists
- ⚠️ Warning — `shared/events.ts` does not exist
- ⚠️ Warning — An event type has no `type` discriminant field
- ⚠️ Warning — An event's `type` value is not UPPER_SNAKE_CASE
- ⚠️ Warning — An `orchestrate/` folder has no `withTransaction()` (domain events + `defer()` may suffice)
- ⚠️ Warning — An `orchestrate/` folder contains non-transactional work (email, external API calls)
- 💡 Hint — API routes are defined outside an `/api` group
- 💡 Hint — `workflow.ts` exceeds ~300 lines or ~10 functions
- 💡 Hint — A workflow calls a parse function (parsing belongs in route)
- 💡 Hint — `slime.config.ts` is missing (it maps error codes to HTTP status codes)
- 💡 Hint — `parse.ts` exceeds ~300 lines or ~10 functions (shared schemas are allowed)
- 💡 Hint — `logic.ts` exceeds ~300 lines or ~10 functions (consider splitting into `logic/`)
- 💡 Hint — A workflow is not referenced by any route (unreachable workflow candidate)
- 💡 Hint — A domain folder has no `routes.ts`
- 💡 Hint — The App layer or `orchestrate/` repeatedly calls the same pair of domains together (consider merging them or redrawing the boundary)
- 💡 Hint — A domain folder has very little in it (consider merging it into another domain)
- 💡 Hint — Non-DB async work (email, external API calls) inside `withTransaction()` (suggests `defer()`; opt-in)
<!-- END GENERATED -->

---

## Guidance for AI Assistants

When implementing a feature that triggers a reaction in another domain (e.g., "when an order is placed, send a notification"):
1. Define the event type in `shared/events.ts` first (`type: "ORDER_PLACED"` with `payload`).
2. Have the originating domain's workflow return the event after the state change.
3. In `app/workflow.ts`, receive the event and call the notification workflow.
4. If the notification is failure-tolerant, wrap it in `defer()`.
5. Do **not** create a `orchestrate/` folder for this — use domain events + `defer()` instead.

When deciding between domain events and `orchestrate/` folder:
- **Use domain events + defer()**: when the follow-up can fail without rolling back the primary operation (email, notifications, analytics).
- **Use orchestrate/ + withTransaction()**: when the follow-up must succeed or fail atomically with the primary operation (stock deduction, balance transfer).

### Naming, Splitting, and Merging Domains

Domain names and boundaries are domain vocabulary, and the user ratifies them: Kaachan detects, you propose, the user decides. Never create, merge, or rename a domain folder, an `orchestrate/` folder, or a `logic/` file without the user's approval.

Every proposal contains:
1. **The candidate groups** — which functions and files go where, and why they belong together.
2. **A name for each group, labeled with its provenance**:
   - **established** — traceable to a word the user actually used, or to a name the user previously approved.
   - **coined** — anything else. Give a one-line definition and expect the user to question it.
   A word that appears only in AI-written docs, comments, or identifiers is NOT established: an AI coinage recorded in a document is still a coinage. Specs and business terms the user brought in count as established; specs written by an AI do not.
3. **A "keep as-is" option** — splitting and merging cost import churn and declaration updates, so leaving the structure alone is a legitimate outcome.

Size thresholds only catch growth. Also watch for the reverse — the current split may be on the wrong axis, or two domains may really be one concern:
- Adding a dependency direction would create a cycle → the boundary is likely in the wrong place.
- The App layer or `orchestrate/` calls the same pair of domains together again and again → they may be one domain.
- A domain folder has very little in it → over-split.
- Business judgment accumulates in `shared/` → a domain that has not been named yet.
- The same set of domains keeps changing together across unrelated commits (check `git log --name-only -- src/domains`) → the split does not follow the real boundary.

When you notice one of these signs, propose a merge or re-cut in the same form as a split. Do this only when a sign appears or the user asks — do not propose reorganizations unprompted. When applying an approved merge or re-cut, also update everything keyed by the domain name: the dependency declaration in `slime.config.ts`, the error code prefixes (`USER_*`), and `routes.ts`.

---

## Next Step: Lv9

To advance to Lv9, introduce Ports & Adapters:
- `domains/xxx/ports.ts` — interface definitions that the domain depends on
- `infrastructure/` folder — concrete implementations (DB adapters, external service adapters)

Run `slime level:next` to check what is needed.
