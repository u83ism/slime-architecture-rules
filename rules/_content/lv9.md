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
  cross-auth/
    logic.ts
    ports.ts
  cross-notification/
    ports.ts
```

> Note: `store.ts` is absent from all domain and shared folders at Lv9. It has been split into `ports.ts` (interface specification) and `infrastructure/*/prismaAdapter.ts` (ORM implementation). The word "store" no longer appears in the codebase.

---

## Ports & Adapters Rules (new at Lv9)

### ports.ts in each domain/cross folder

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
  async (input: ValidatedInput): Promise<UserCreatedEvent> => {
    const exists = await port.findByEmail(input.email)
    const check = userCanCreate(!!exists)
    if (!check.ok) throw new Error(check.error)
    const user = await port.save(input)
    return { type: "USER_CREATED", payload: { userId: user.id, email: user.email } }
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

## Cross Folder Rules (unchanged from Lv7–Lv8)

- `cross-[kebab-case]` naming. Domains import from `cross-`, not the reverse.
- Cross folders may also have `ports.ts` for their own infrastructure boundaries.
- `cross-` folders specialized for transactions (Lv8 rule continues).

---

## Domain Folder Rules (unchanged from Lv6–Lv8)

- `domain[A-Z]camelCase` naming. Domains must not import from each other.
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
- No imports from domain or `cross-` folders.

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
- **Dependency Inversion**: domains define what they need (ports); infrastructure provides how (adapters).
- **Infrastructure is replaceable**: swapping DB or external services requires only changing `infrastructure/`, not domain code.

---

## What Kaachan Checks at Lv9

- `infrastructure/` folder exists.
- Domain folders and `cross-` folders do not import from `infrastructure/` directly.
- ORM/DB module imports are confined to `infrastructure/`.
- `ports.ts` in each domain/cross folder contains only type definitions (no implementation code, no ORM imports).
- `store.ts` no longer exists anywhere in the codebase (it has been replaced by `ports.ts` + `infrastructure/`).
- `logic.test.ts` missing → ❌ Error.
- All Lv8 checks continue to apply.

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
