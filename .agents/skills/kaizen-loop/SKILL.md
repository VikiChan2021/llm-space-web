---
name: kaizen-loop
description: Run one evidence-grounded product iteration. Use when the user asks to inspect a product, decide what to build next, audit a workflow, or plan or implement the next coherent capability. Require a fresh capability map, one north-star metric, current market evidence for new functionality, one main recommendation plus two alternatives, and explicit approval before product-code changes.
---

# Kaizen Loop

Run one loop for one coherent, user-visible v1 capability. Product progress is
the goal; technical work is eligible only when it unlocks or protects that
capability.

## Non-negotiable gates

1. Read the repository contract and inspect `git status --short`.
2. Inspect current product evidence. For UI work, use the real rendered surface,
   not a mock or an old screenshot.
3. Refresh `.agents/kaizen-loop/CAPABILITY_MAP.md` for the relevant capabilities.
   Use only `confirmed`, `stale`, or `unknown` freshness.
4. Define one product-level north-star metric: baseline/evidence, v1 target,
   measurement method, and regression guardrails.
5. For new user-facing functionality or positioning, browse current primary
   market sources. Record URLs, access dates, table stakes, the actual gap, and
   uncertainty. If browsing is unavailable or forbidden, label the decision
   evidence-limited.
6. Present one main recommendation, two alternatives, and a concrete v1 plan.
7. Wait for explicit approval before editing product code unless the user has
   already approved that exact plan.

Never revert unrelated user changes. Stop instead of guessing when a blocker
changes intended behavior, risks data loss, exposes secrets, or prevents the
required acceptance evidence.

## Evidence minimum

- Current `AGENTS.md`, README/product brief, relevant architecture and source.
- The capability map and the latest 1-3 active logs, if present.
- Current git status and focused tests or runtime evidence.
- Current rendered product state for UX, onboarding, navigation, or workflow
  decisions.
- External market evidence when gate 5 applies.

Historical logs and audits are clues, not proof of current behavior. Do not use
old screenshots as current acceptance evidence.

## Recommendation output

Include:

- Product diagnosis and capability-map freshness.
- North-star metric, baseline, target, measurement, and guardrails.
- Market scan and uncertainty when applicable.
- Main recommendation and why it wins now.
- User-visible v1 behavior and explicit non-goals.
- Acceptance plan, likely files/modules, validation commands, risks, and stop
  conditions.
- Two alternatives with concise reasons to defer them.

Ask for approval after this output.

## Implementation after approval

Before editing, resolve the target user/job, must-have behavior, non-goals,
acceptance criteria, persistence/data boundaries, risks, and stop conditions in
the conversation. If UI interaction is involved, confirm entry points, primary
actions, states, transitions, keyboard/selection behavior, side effects, and
acceptance evidence. If this changes scope, revise the plan and ask again.

Then:

- Build the smallest complete end-to-end v1 using existing architecture,
  package manager, design system, and host/security boundaries.
- Verify affected tests and commands from the repository contract.
- For visible behavior, verify the real surface with screenshots plus console,
  network, interaction, layout, overflow, persistence, and accessibility checks
  as applicable.
- Review the diff for regressions and boundary violations.
- Update the capability map to match what was actually verified.

Stop when the approved plan proves wrong, acceptance cannot be run, or the work
would require a second product loop.

## Durable log

Write one Markdown decision log at:

`.agents/kaizen-loop/logs/YYYY-MM-DD-HHMMSS-short-slug.md`

Use `Status: draft` during discovery and `Status: done` before handoff. Record:
trigger and starting git status; evidence; market scan; capability freshness;
metric; recommendation and alternatives; v1/non-goals; plan and approval;
resolved requirements; work performed; verification; review; risks; outcome;
and the next suggested loop. Never record secrets, tokens, raw auth headers, or
private payloads.

## Final response

Report the recommendation or shipped capability, metric, capability-map change,
acceptance and test results, review findings, remaining risks, and log path. If
blocked, state the exact missing user decision or external state.
