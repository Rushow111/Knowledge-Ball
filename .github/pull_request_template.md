## Summary

<!-- What does this PR change? Keep the scope focused. -->

## Root cause / change reason

<!-- For a bug: identify the first incorrect responsibility, state transition, invariant, or implementation detail. For a feature: explain the design reason for the change. -->

## Before chain

```text
<!-- Relevant execution/state chain before this change. -->
```

## After chain

```text
<!-- Simplified intended execution/state chain after this change. -->
```

## Why this is a root-cause fix

<!-- Explain why this removes the broken mechanism instead of masking the symptom. If this is not a bug fix, write N/A and explain the design choice. -->

## Scope intentionally not changed

- [ ] No unrelated refactor or cleanup was bundled into this PR.
- [ ] Android was not modified unless the task explicitly required Android work.
- [ ] iOS was not modified unless the task explicitly required iOS work.
- [ ] Frozen protocol semantics were not changed silently.

Notes:

<!-- List nearby systems deliberately left untouched. -->

## Validation

- [ ] `npm run build`
- [ ] Relevant focused regression test(s)
- [ ] `npm test` when shared behavior can be affected
- [ ] Relevant browser / Playwright test for interaction changes

Executed successfully:

<!-- List only commands that actually passed. -->

Not executed / blocked:

<!-- Be explicit about environment, credentials, deployment, hosted schema, or real-device limitations. -->

## Real-device / production verification

- [ ] Real Android Chrome/WebView tested when required by the defect
- [ ] Deployed/production page tested when required
- [ ] Not applicable

Details:

<!-- Do not describe desktop mobile emulation as real-device verification. -->

## Residual risk

<!-- Remaining uncertainty: real device, GPU/driver, scale, concurrency, production data, hosted schema, etc. -->

## Merge

- [ ] This PR is ready for review.
- [ ] Do not merge automatically; merge only after explicit approval.
