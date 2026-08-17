# Knowledge Ball — Agent Engineering Rules

This file defines repository-wide instructions for coding agents and automated contributors.

Read this file before changing code. For the reasoning behind these rules, read `docs/engineering-principles.md`.

## 1. Default scope

Unless the task explicitly says otherwise:

- Treat the Web application as the active development target.
- Do not modify `android/`.
- Do not modify `ios/`.
- Do not merge into `main`.
- Create a focused branch / PR for review.
- Do not combine unrelated cleanup, refactors, dependency upgrades, or visual changes with the requested task.

If a task explicitly requires Android or iOS work, the explicit task overrides the default read-only rule for that platform only.

## 2. Root-cause-first bug fixing

Before editing code, classify the defect as one of:

1. local implementation bug;
2. execution-chain bug;
3. state-ownership bug;
4. lifecycle/resource-management bug;
5. architecture/design bug.

For a local implementation bug, make the smallest correct fix.

For an execution-chain, ownership, lifecycle, or architecture bug:

- do not stack a workaround on top of the broken design;
- identify the current execution chain;
- identify the first incorrect responsibility or state transition;
- define the simpler target chain;
- remove the obsolete path when safe;
- replace it with the smallest coherent implementation;
- add a regression test for the root cause.

Never add a workaround merely to suppress a symptom when the underlying design is known to be wrong.

If the same defect has already received multiple attempted fixes, stop adding patches and re-evaluate the responsible boundary or lifecycle before changing more code.

## 3. One root cause, one focused change

A bug-fix PR should normally address one root cause.

Do not simultaneously rewrite surrounding systems unless the root cause cannot be fixed without changing that boundary.

Examples:

- a WebGL lifecycle fix must not also redesign Supabase sync;
- a panel rendering fix must not also change the knowledge protocol;
- an authentication fix must not also rewrite graph physics;
- a Web-only bug must not opportunistically modify native Android/iOS code.

## 4. Ownership and lifecycle rules

Each important state or resource must have one clear owner.

- Pointer/input code reports user intent; it must not own GPU lifecycle.
- Panel/modal code owns panel/modal UI state; it must not destroy the renderer.
- `KnowledgeScene` owns the Three.js renderer, animation loop, scene resources, and scene pause/resume lifecycle.
- Persistence owns persistence concerns.
- Sync owns remote synchronization concerns.
- Protocol/domain code owns semantic validation and domain rules.

Do not let two modules independently start/stop, create/destroy, or mutate the same resource lifecycle without a documented coordinator.

### WebGL-specific rule

Normal UI interactions such as opening/closing a node panel, modal, account view, or settings view must not simulate GPU failure or destroy/recreate the rendering surface merely to pause work.

For normal UI suspension prefer:

- stop/cancel the animation loop;
- pause physics/layout/edge/label work;
- preserve the WebGL context;
- preserve the renderer canvas in its host;
- resume the existing scene when the overlay closes.

`forceContextLoss()`, `forceContextRestore()`, renderer disposal, and canvas teardown belong only to explicit diagnostics, genuine recovery handling, or final scene destruction—not routine panel transitions.

## 5. Protocol and immutable-version boundaries

`ORIGINAL_DESIGN_V1` is a frozen semantic policy version.

- Do not silently change V1 semantics to satisfy a new product requirement.
- Existing V1 events must remain replayable under V1 semantics.
- A semantic policy change should be introduced as a new version (for example V2) unless the task is explicitly a backward-compatible bug fix that does not alter the locked meaning.
- Preserve published/history immutability rules unless the task explicitly changes the product specification through a new versioned design.

Do not duplicate protocol constants or semantic rules into UI code when a canonical domain/protocol output already exists.

## 6. Data and state boundaries

Keep public knowledge state and private/personal state conceptually separate.

Do not introduce hidden private copies of public knowledge as a convenience workaround.

Do not make UI components direct owners of durable domain truth when the event/domain layer already owns that truth.

Prefer explicit commands/events and deterministic projection over ad-hoc cross-module mutation.

## 7. Performance rules

Do not fix performance problems by destroying expensive resources on every interaction unless destruction is truly the required lifecycle.

Before introducing heavy work into a click/submit path, identify its complexity and frequency.

Avoid unbounded full-graph work in high-frequency UI interactions when an indexed, cached, incremental, or scoped alternative is available.

For mobile-Web regressions, automated emulation is necessary but not sufficient when the defect is known to depend on real Android Chrome/WebView/GPU behavior. Document that limitation in the PR.

## 8. Required bug-fix explanation

A non-trivial bug-fix PR should state:

- **Root cause** — what was actually wrong;
- **Before chain** — the relevant execution/state chain before the fix;
- **After chain** — the intended chain after the fix;
- **Why this is a root-cause fix** — why it removes the broken responsibility instead of masking the symptom;
- **Scope** — what was intentionally not changed;
- **Regression coverage** — tests added or existing tests used;
- **Residual risk** — anything that still needs real-device or production verification.

## 9. Validation expectations

Run the smallest relevant checks during iteration, then the appropriate repository checks before declaring the task complete.

At minimum for normal Web code changes:

1. TypeScript / production build (`npm run build`);
2. the directly relevant regression test(s);
3. `npm test` when the change can affect shared behavior;
4. relevant Playwright/mobile browser checks for interaction regressions.

For broader changes also use the repository's architecture, persistence, sync, auth, Pages, merge, or production-browser verification as applicable.

Never claim a test passed if it was not executed successfully.

## 10. Completion rules

Do not describe a symptom-level mitigation as a root-cause fix.

Do not claim real-device Android Chrome/WebView validation from desktop emulation alone.

Do not merge the PR unless the user explicitly requests the merge.

When blocked by environment, credentials, hosted schema, or deployment state, report exactly what was and was not verified instead of guessing.
