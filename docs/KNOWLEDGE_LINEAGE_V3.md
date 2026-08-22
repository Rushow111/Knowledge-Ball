
# Knowledge Lineage V3 — current product contract
This current-product contract supersedes only conflicting behavior. `ORIGINAL_DESIGN_V1` remains the rule source for second-verification/challenge policy.

1. Every semantic edit creates a new immutable ball. Optimize and oppose never overwrite the old ball.
2. Each topic has one current ball, one linear grey history chain (rank 1 = previous version), and one linear red opposition chain.
3. Optimization candidates are grey + PENDING; opposition candidates are red + PENDING. Failed candidates remain audit history but do not enter visible chains.
4. Optimization may reuse the current target title; unrelated title uniqueness remains unchanged.
5. Successful optimize: old current -> grey history; candidate -> current. Successful opposition: old current+history -> red; prior red -> grey history; winning candidate -> current.
6. Stable grey/red reactivation is the already-designed second verification: V1 stage 0, 10 energy, GLOBAL. UI does not redefine its policy. Confirmed start changes only PENDING/flashing, not grey/red colour.
7. A current-head change recursively marks every directed premise descendant PENDING. Cascade has no initiator stake or initiator vote; a 30-day tie remains PENDING.
8. View modes cycle Current -> Personal -> Lineage. Stable grey/red only show in Lineage; any PENDING ball remains visible.
9. Detail neighbours: left direct premises, right direct conclusions, top linear history, bottom linear opposition. Only names; no empty placeholders.
