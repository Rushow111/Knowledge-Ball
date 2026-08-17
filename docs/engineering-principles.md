# Knowledge Ball Engineering Principles

This document explains the engineering model that complements the repository-wide rules in `AGENTS.md`.

The goal is not to prevent change. The goal is to make changes easier to reason about, easier to test, and less likely to create chains of compensating patches.

## 1. Diagnose the layer before editing the symptom

A visible bug can originate from very different layers.

### Local implementation bug

Examples:

- a condition is inverted;
- a null case is missing;
- an event handler is bound twice;
- a selector or CSS rule is incorrect;
- an API call uses the wrong argument.

Preferred response: make the smallest correct local fix and add a focused regression test.

### Execution-chain bug

The individual functions may look valid, but the order or ownership of operations is wrong.

Example:

```text
pointerup
  -> tear down canvas
  -> simulate WebGL context loss
  -> open panel
  -> overlay changes scene state again
  -> restore context
  -> re-append canvas
```

The problem is not necessarily a bad conditional. The execution chain itself is unnecessarily destructive.

Preferred response: write down the current chain, define the target chain, and replace the invalid transitions.

### State-ownership bug

Two or more modules believe they own the same state or lifecycle.

Typical symptoms:

- duplicate start/stop calls;
- state immediately being overwritten;
- repeated rebuilds;
- stale subscriptions;
- race conditions between UI and data layers;
- cleanup that belongs to one module being performed by another.

Preferred response: choose one owner and turn the other modules into clients of that owner.

### Lifecycle/resource-management bug

A long-lived resource is created/destroyed at the wrong frequency or in response to the wrong event.

Examples:

- destroying a renderer to pause a modal;
- recreating large graph objects on every tap;
- reconnecting subscriptions for ordinary UI transitions;
- disposing a scene when only rendering should pause.

Preferred response: separate `pause/resume` from `create/destroy`.

### Architecture/design bug

The module boundaries or product invariants make correct behavior difficult to express without exceptions.

Preferred response: change the incorrect boundary deliberately, in a focused PR, with compatibility and migration effects stated explicitly.

## 2. Patch only when the design is already correct

A patch is appropriate when the intended architecture is sound and the implementation deviates from it.

A patch is not appropriate when the patch exists only to compensate for another incorrect responsibility.

Warning signs that a patch chain should be stopped:

- the same defect has been “fixed” several times;
- every new fix introduces another special case;
- a UI action triggers unrelated persistence, GPU, sync, or protocol work;
- two modules both perform cleanup for the same resource;
- automated tests pass while the real interaction remains unreliable;
- a mitigation makes the control flow harder to explain than the original feature.

When these signs appear, the next change should first identify the broken boundary rather than add another condition.

## 3. Prefer a simple target chain

The desired execution path should be explainable in a small number of steps.

For example, a node detail interaction should conceptually look like:

```text
user taps node
  -> input layer emits node id
  -> application selects node
  -> panel opens
  -> scene pauses expensive background work
```

Closing the panel should conceptually be:

```text
panel closes
  -> scene resumes existing resources
```

The pointer layer does not need to know how a GPU resource is managed. The panel does not need to destroy the renderer. The renderer does not need to know domain protocol semantics.

This principle generalizes beyond WebGL: keep the chain short and keep responsibilities local.

## 4. Separate suspension from destruction

Long-lived resources should distinguish four concepts:

- create;
- run;
- suspend/resume;
- destroy.

They should not be collapsed into a single toggle.

For a rendering system:

```text
CREATE
  -> RUNNING
  -> SUSPENDED
  -> RUNNING
  -> DESTROYED
```

A routine overlay should normally move the system between `RUNNING` and `SUSPENDED`.

Destruction belongs to actual scene/application teardown. Context-loss recovery belongs to exceptional browser/GPU behavior, not ordinary UI navigation.

## 5. One owner per important lifecycle

A resource may have many users, but it should have one lifecycle owner.

Recommended Knowledge Ball boundaries:

### Input layer

Owns pointer/touch interpretation.

Produces intents such as:

- node tapped;
- background tapped;
- drag started;
- zoom changed.

It should not own persistence, protocol validation, renderer destruction, or account state.

### Panel/modal layer

Owns UI presentation and user input for overlays.

It should request scene suspension/resumption through an explicit interface rather than manipulating renderer internals.

### KnowledgeScene

Owns:

- Three.js scene objects;
- renderer and canvas lifecycle;
- animation scheduling;
- scene-level physics/layout work;
- scene pause/resume/dispose.

### Domain/protocol layer

Owns semantic validity and versioned knowledge rules.

The UI may display results, but it should not re-implement semantic constants or create divergent interpretations.

### Event/projection layer

Owns durable domain changes and deterministic derived state.

### Persistence layer

Owns durable local storage behavior.

### Sync layer

Owns remote synchronization and convergence concerns.

### Auth/account layer

Owns authenticated identity/session concerns.

## 6. Keep product invariants explicit

Important product rules should be represented as domain rules, tests, versioned policy, or architecture documentation—not scattered assumptions.

For Knowledge Ball this includes, among other things:

- canonical public knowledge versus private personal mastery/state;
- immutable published/history behavior;
- versioned truth-policy semantics;
- event-driven durable state changes;
- deterministic replay/projection expectations;
- explicit energy/account invariants where applicable.

When a product invariant changes semantically, prefer an explicit versioned design change over silently changing the meaning of historical data.

## 7. Protect frozen protocol versions

`ORIGINAL_DESIGN_V1` is treated as a historical semantic contract.

A new product rule should not normally be forced into V1 if it changes what existing V1 events mean.

Use a new policy version when semantics change.

Backward-compatible implementation fixes may still be valid, but the PR must explain why the locked meaning remains unchanged.

This distinction prevents old data from changing meaning simply because the current client was upgraded.

## 8. Change isolation is a debugging tool

Small scope is not only about review convenience. It is also a diagnostic method.

When investigating a freeze or corruption issue, change one suspected mechanism at a time whenever practical.

Example sequence:

```text
experiment A: remove destructive WebGL lifecycle transitions
if still failing:
experiment B: isolate panel construction
if still failing:
experiment C: isolate persistence/subscription work
```

Do not change all three simultaneously unless evidence proves they form one inseparable root cause.

This preserves the ability to learn from each experiment.

## 9. Complexity belongs in design reviews

Any operation in a high-frequency path should have an understood cost.

High-frequency paths include:

- pointer/tap handlers;
- animation frames;
- physics ticks;
- label updates;
- graph edge updates;
- node panel opening;
- submit actions.

Questions to ask:

- Is this O(1), O(log N), O(N), O(N log N), or O(N²)?
- How often does it run?
- Does it allocate large temporary structures?
- Does it rebuild DOM or GPU resources?
- Can it be cached, indexed, incremental, or deferred?
- Does work continue while hidden behind an overlay?

An O(N) operation may be fine on submit and unacceptable on every animation frame. Frequency matters as much as asymptotic complexity.

## 10. Real-device limitations must be stated truthfully

Browser automation is valuable, but it does not perfectly reproduce Android device GPU drivers, memory pressure, Chrome/WebView versions, or vendor-specific behavior.

For bugs known to depend on these factors:

- keep Playwright/browser regression coverage;
- use production/deployed-page verification when appropriate;
- explicitly record whether a real Android device was tested;
- never convert “desktop Chromium mobile emulation passed” into “Android device verified.”

## 11. Expected PR reasoning format

For non-trivial fixes, use this structure:

### Root cause

The first incorrect responsibility, state transition, invariant, or implementation detail that explains the observed behavior.

### Before chain

A short execution/state path showing how the bug occurs.

### After chain

The simplified intended path.

### Why this removes the root cause

Explain what invalid mechanism was removed or reassigned.

### Scope intentionally not changed

List nearby systems deliberately left untouched.

### Validation

List exactly what ran successfully, what failed, and what could not be verified.

### Residual risk

Call out real-device, production, hosted-schema, concurrency, or performance uncertainty that still remains.

## 12. Governance roadmap

Repository governance should evolve in three layers:

```text
AGENTS.md
  -> tells coding agents how to work

docs/engineering-principles.md + architecture/domain docs
  -> explain why the boundaries exist

executable architecture guards + CI
  -> reject forbidden dependencies or lifecycle patterns automatically
```

The third layer should be introduced carefully. A new guard should not knowingly make the existing default branch permanently red. First remove the existing violation in a focused fix; then add the executable rule so it cannot silently return.

Examples of future guards after the corresponding legacy violations are removed:

- forbid routine `forceContextLoss()` / `forceContextRestore()` in UI interaction code;
- prevent UI modules from importing direct persistence/sync internals where a public boundary exists;
- protect frozen protocol V1 files from accidental semantic edits;
- detect unexpected Android/iOS changes in Web-only PRs when the CI context provides a reliable diff base.
