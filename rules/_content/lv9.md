# Slime Architecture Rules — Level 9 (Ports & Adapters)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv9**: infrastructure boundaries are explicit via `ports.ts` and `infrastructure/`. The word "store" disappears from the codebase.

---

## Project Structure

```
src/
  app/
    route.ts
    workflow.ts     # Wires ports to domain workflows (composition root)
    parse.ts
    middleware.ts
  shared/
    utility.ts
    smallLogic.ts
    events.ts
  client/
    client.ts
    adapter.ts
  infrastructure/               # All concrete implementations (the only layer that imports ORM/DB)
    user/
      prismaAdapter.ts          # Implements UserPort from domainUser/ports.ts
    order/
      prismaAdapter.ts          # Implements OrderPort from domainOrder/ports.ts
  domainUser/
    routes.ts
    workflow.ts                 # Receives port as argument — no ORM imports
    ports.ts                    # Interface definitions the domain depends on (new at Lv9)
    logic.ts
    logic.test.ts
  domainOrder/
    routes.ts
    workflow.ts
    ports.ts
    logic.ts
    logic.test.ts
  domainAuth/                 # Upstream domain (see Lv6)
    workflow.ts
    ports.ts
    logic.ts
    logic.test.ts
  orchestrate-order-inventory/
    workflow.ts
```

> Note: `store.ts` is absent from all domain and shared folders at Lv9. It has been split into `ports.ts` (interface specification) and `infrastructure/*/prismaAdapter.ts` (ORM implementation). The word "store" no longer appears in the codebase.

---

## Ports & Adapters Rules (new at Lv9)

### ports.ts in each domain folder

- Defines the **interface contracts** the domain depends on — what it needs from the outside world.
- Contains only TypeScript types — **no implementation, no imports from infrastructure**.
- Represents "what the domain needs", not "how it is implemented".

```ts
// domainUser/ports.ts
export type UserPort = {
  findByEmail: (email: string) => Promise<User | null>
  findById: (id: string) => Promise<User | null>
  save: (user: NewUser) => Promise<User>
  listActive: () => Promise<User[]>
}
```

### infrastructure/

- Contains all concrete implementations of ports (DB adapters, external service adapters).
- **The only layer allowed to import ORM/DB/external SDK modules directly.**
- Organized by domain: `infrastructure/user/`, `infrastructure/order/`, etc.
- Must implement the port interfaces defined in domain `ports.ts` files.
- Domain folders must **not** import directly from `infrastructure/`.

```ts
// infrastructure/user/prismaAdapter.ts
import { UserPort } from '../../domainUser/ports'

export const prismaUserPort: UserPort = {
  findByEmail: (email) => prisma.user.findUnique({ where: { email } })
    .then(r => r ? { id: r.id, name: r.name, email: r.email } : null),
  findById: (id) => prisma.user.findUnique({ where: { id } })
    .then(r => r ? { id: r.id, name: r.name, email: r.email } : null),
  save: (user) => prisma.user.create({ data: user })
    .then(r => ({ id: r.id, name: r.name, email: r.email })),
  listActive: () => prisma.user.findMany({ where: { status: 'active' } })
    .then(rs => rs.map(r => ({ id: r.id, name: r.name, email: r.email }))),
}
```

### Workflow — Port injection

- Workflows receive port implementations as arguments (functional dependency injection — no DI container, no class).
- This makes workflows testable without infrastructure — pass mock implementations in tests.
- The **app-layer workflow** (`app/workflow.ts`) wires the concrete infrastructure adapters to domain workflows.

```ts
// domainUser/workflow.ts
export const createUserWorkflow =
  (port: UserPort) =>                           // port injected as argument
  async (input: ValidatedInput): Promise<Result<UserCreatedEvent, UserErrorCode>> => {
    const exists = await port.findByEmail(input.email)
    const check = userCanCreate(!!exists)
    if (!check.ok) return check
    const user = await port.save(input)
    return ok({ type: "USER_CREATED", payload: { userId: user.id, email: user.email } })
  }

// app/workflow.ts — wires infrastructure to domain workflow
import { createUserWorkflow } from '../domainUser/workflow'
import { prismaUserPort } from '../infrastructure/user/prismaAdapter'

export const CreateUserWorkflow = createUserWorkflow(prismaUserPort)
```

### Dependency direction

```
domainXxx/workflow.ts  →  domainXxx/ports.ts (depends on interface)   ✅
infrastructure/*/      →  domainXxx/ports.ts (implements interface)    ✅
app/workflow.ts        →  infrastructure/*/ (wires concrete adapter)   ✅
domainXxx/workflow.ts  →  infrastructure/*/ (must NOT know adapter)    ❌
infrastructure/*/      →  domainXxx/workflow.ts                        ❌
```

---

## Orchestrate Folder Rules (unchanged from Lv7–Lv8)

- `orchestrate-[kebab-case]` naming. `orchestrate-` folders import from domains, not the reverse.
- `orchestrate-` folders specialized for transactions (Lv8 rule continues).

---

## Domain Folder Rules (unchanged from Lv6–Lv8)

- `domain[A-Z]camelCase` naming. Inter-domain imports follow the declared dependency DAG (see Lv6).
- All Lv1–Lv8 layer rules apply within each domain.

### Layer rules within each domain
- `workflow.ts`: orchestrates via injected ports — no ORM imports, no direct infrastructure.
- `ports.ts`: interface definitions only — no implementation code.
- `logic.ts`: pure functions with domain-prefixed names, `Result` for fallible operations.
- `logic.test.ts`: mandatory — missing is ❌ Error.

---

## shared/events.ts Rules (unchanged from Lv8)

- All domain event type definitions in one file.
- Events: `{ type: "UPPER_SNAKE_CASE", payload: { ... } }`.
- No imports from domain or `orchestrate-` folders.

---

## Error Handling

- **Validation failures**: framework returns HTTP 400. **Auth/middleware rejection**: 401, 403, or 429.
- **Business rejections travel as return values all the way to the route.** Domain `logic.ts` and `client/adapter.ts` return `Result.err(code)`. Workflows (domain, `orchestrate-`, and app) pass it upward with an early `return`. The response wrapper (`json(...)`) maps the code to a 4xx status.
- **Do not throw business rejections** from workflows — return `err(...)`. `throw` is reserved for technical failures (bugs, DB down, network), which become HTTP 500.
- Workflows that cannot reject may return a plain value.
- `withTransaction()` rolls back when its callback returns `err` (as well as when it throws) and commits on `ok`.
- **Each domain declares its own error codes** in `domainXxx/errors.ts`, prefixed with the domain name (`domainUser` → `USER_*`). Domains know nothing about HTTP status codes.
- The status map lives outside the domains (`slime.config.ts`) and must cover the union of all domain codes. Use `satisfies Record<DomainErrorCode, number>` so a missing entry is a type error.
- Error responses use **Problem Details** (RFC 9457, `Content-Type: application/problem+json`) with a `code` extension member. Frontends may `import type` the code union to keep their message tables exhaustive.

```ts
// domainUser/errors.ts — codes only, no HTTP knowledge
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

// domainUser/workflow.ts — rejections are returned, not thrown
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
- **Dependency Inversion**: domains define what they need (ports); infrastructure provides how (adapters).
- **Infrastructure is replaceable**: swapping DB or external services requires only changing `infrastructure/`, not domain code.

---

## What Kaachan Checks at Lv9

<!-- BEGIN GENERATED: kaachan-checks lv=9 （src/rules-catalog.ts から自動生成。手で編集しない） -->
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
- ❌ Error — A domain folder imports from `infrastructure/` directly
- ❌ Error — An ORM/DB module is imported outside `infrastructure/`
- ❌ Error — `ports.ts` contains implementation code (type definitions only)
- ❌ Error — `store.ts` still exists (split it into `ports.ts` and `infrastructure/`)
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
- ⚠️ Warning — A domain error code lacks the domain prefix (`domainUser` → `USER_*`)
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
- ⚠️ Warning — The `infrastructure/` folder does not exist
- 💡 Hint — API routes are defined outside an `/api` group
- 💡 Hint — `workflow.ts` exceeds ~300 lines or ~10 functions
- 💡 Hint — A workflow calls a parse function (parsing belongs in route)
- 💡 Hint — `slime.config.ts` is missing (it maps error codes to HTTP status codes)
- 💡 Hint — `parse.ts` exceeds ~300 lines or ~10 functions (shared schemas are allowed)
- 💡 Hint — `logic.ts` exceeds ~300 lines or ~10 functions (consider splitting into `logic/`)
- 💡 Hint — A workflow is not referenced by any route (unreachable workflow candidate)
- 💡 Hint — A domain folder has no `routes.ts`
- 💡 Hint — Non-DB async work (email, external API calls) inside `withTransaction()` (suggests `defer()`; opt-in)
- 💡 Hint — A domain has `ports.ts` but its workflow does not receive a port as an argument
<!-- END GENERATED -->

---

## Guidance for AI Assistants

When adding a new external dependency (new DB table, new third-party API):
1. Define the port interface in `domainXxx/ports.ts` first — describe what the domain needs, not how it is implemented.
2. Create the adapter in `infrastructure/<domain>/` implementing that interface.
3. Wire the adapter into the domain workflow in `app/workflow.ts`.
4. Never import the infrastructure adapter directly inside a domain folder.

When writing tests for workflows:
- Pass mock implementations of the port interfaces — no DB setup needed.
- Test logic functions directly — they are pure and need no mocks at all.

When migrating from Lv8 to Lv9:
1. For each domain, extract the interface contract from `store.ts` into `ports.ts` (types only).
2. Move the ORM implementation from `store.ts` into `infrastructure/<domain>/prismaAdapter.ts`.
3. Update domain `workflow.ts` to receive the port as a constructor argument.
4. Wire the adapter in `app/workflow.ts`.
5. Delete `store.ts` from all domain and shared folders.

---

## Next Step: Lv10

To advance to Lv10, introduce CQRS within domain folders:
- `command/` subfolder — write-side operations
- `query/` subfolder — read-side operations

Run `slime level:next` to check what is needed.
