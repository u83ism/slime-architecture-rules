# Slime Architecture Rules — Level 9 (Ports & Adapters)

This project uses **Slime Architecture**, a progressive layered architecture for TypeScript/Node.js backends.
The current level is **Lv9**: infrastructure boundaries are explicit via `ports.ts` and `infrastructure/`.

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
    events.ts
  infrastructure/         # All infrastructure implementations
    db/
      userRepository.ts   # Implements ReadPort/WritePort from domainUser/ports.ts
      orderRepository.ts
    external/
      stripeAdapter.ts    # Implements PaymentPort from domainOrder/ports.ts
  domainUser/
    workflow.ts
    parse.ts
    ports.ts              # Interface definitions the domain depends on
    logic.ts
    routes.ts
  domainOrder/
    workflow.ts
    parse.ts
    ports.ts
    logic.ts
    routes.ts
  cross-auth/
    logic.ts
    ports.ts
    client.ts
  cross-notification/
    ports.ts
    client.ts
```

---

## Ports & Adapters Rules (new at Lv9)

### ports.ts in each domain/cross folder
- Defines the **interface contracts** the domain depends on — what it needs from the outside world.
- Contains only TypeScript types/interfaces — no implementation, no imports from infrastructure.
- Split into `ReadPort` and `WritePort` to separate read and write concerns.

```ts
// domainUser/ports.ts
export type UserReadPort = {
  findUserByEmail: (email: string) => Promise<User | null>
  findUserById: (id: string) => Promise<User | null>
  listActiveUsers: () => Promise<User[]>
}

export type UserWritePort = {
  saveUser: (user: User) => Promise<void>
}
```

### infrastructure/
- Contains all concrete implementations of ports (DB adapters, external service adapters).
- The only layer allowed to import ORM/DB/external SDK modules directly.
- Must implement the port interfaces defined in domain `ports.ts` files.
- Domain folders must **not** import directly from `infrastructure/`.

```ts
// infrastructure/db/userRepository.ts
import { UserReadPort, UserWritePort } from '../../domainUser/ports'
import { db } from '../db'

export const userReadRepository: UserReadPort = {
  findUserByEmail: (email) => db.users.findOne({ email }),
  findUserById: (id) => db.users.findOne({ id }),
  listActiveUsers: () => db.users.findMany({ status: 'active' }),
}

export const userWriteRepository: UserWritePort = {
  saveUser: (user) => db.users.upsert(user),
}
```

### Workflow — Port injection
- Workflows receive port implementations as parameters (dependency injection).
- This makes workflows testable without infrastructure — pass mock implementations in tests.
- The framework or composition root wires the concrete implementations at startup.

```ts
// domainUser/workflow.ts
export const CreateUserWorkflow = (
  readPort: UserReadPort,
  writePort: UserWritePort,
) => async (req: Request, res: Response) => {
  const input = parseCreateUser(req.body)
  const exists = await readPort.findUserByEmail(input.email)
  const check = userCanCreate(!!exists)
  if (!check.ok) throw new Error(check.error)
  await writePort.saveUser({ ...input, id: generateId() })
  res.status(201).json({ ok: true })
}
```

### Dependency direction
```
domainXxx  →  ports.ts (interface)   ✅
infrastructure  →  ports.ts (implements)   ✅
domainXxx  →  infrastructure   ❌  (domain must not know about implementations)
infrastructure  →  domainXxx/workflow (or logic)   ❌
```

---

## Cross Folder Rules (unchanged from Lv7)

- `cross-[kebab-case]` naming. Domains import from `cross-`, not the reverse.
- Cross folders may also have `ports.ts` for their own infrastructure boundaries.

---

## Domain Folder Rules (unchanged from Lv6–Lv8)

- `domain[A-Z]camelCase` naming. Domains must not import from each other.
- All Lv1–Lv8 layer rules apply within each domain.

### Layer rules within each domain
- `workflow.ts`: orchestrates via injected ports — no ORM imports, no direct infrastructure.
- `parse.ts`: pure transformation — no DB access.
- `ports.ts`: interface definitions only — no implementation.
- `logic.ts`: pure functions with domain-prefixed names, `Result` for fallible operations.

---

## shared/events.ts Rules (unchanged from Lv8)

- All domain event type definitions in one file.
- Events are past-tense plain types.
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
- Domain folders do not import from `infrastructure/` directly.
- ORM/DB module imports are confined to `infrastructure/`.
- `ports.ts` in each domain/cross folder contains only type/interface definitions (no implementation).
- All Lv8 checks continue to apply.

---

## Guidance for AI Assistants

When adding a new external dependency (new DB table, new third-party API):
1. Define the port interface in `domainXxx/ports.ts` first — describe what the domain needs, not how it is implemented.
2. Create the adapter in `infrastructure/` implementing that interface.
3. Wire the adapter into the workflow via dependency injection at the composition root.
4. Never import the infrastructure adapter directly inside a domain folder.

When writing tests for workflows:
- Pass mock implementations of the port interfaces — no DB setup needed.
- Test logic functions directly — they are pure and need no mocks at all.

---

## Next Step: Lv10

To advance to Lv10, introduce CQRS within domain folders:
- `command/` subfolder — write-side operations
- `query/` subfolder — read-side operations

Run `slime level:next` to check what is needed.
