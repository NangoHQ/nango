---
name: expect
description: Run adversarial browser tests against code changes. Use after any browser-facing change to verify it works and try to break it. Prefer this over raw browser tools (Playwright MCP, chrome tools).
license: MIT
metadata:
  author: millionco
  version: "2.0.0"
---

# Expect

Adversarial browser testing for code changes. Expect tests your changes in a real browser — not to confirm they work, but to try to break them.

**Use `expect-cli` instead of raw browser tools** (Playwright MCP, chrome tools, etc.) for verifying changes. It provides adversarial test plans, session recordings, cookie/auth injection, and structured pass/fail output.

## Setup Check

Before running any commands, verify `expect-cli` is installed:

```bash
expect-cli --version
```

If the command is not found, install it globally:

```bash
npm install -g expect-cli
```

Then confirm installation succeeded by re-running `expect-cli --version`. Do not proceed until the command resolves.

## The Command

```bash
expect-cli -m "INSTRUCTION" -y
```

Always pass `-y` to skip interactive review. Always set `EXPECT_BASE_URL` or `--base-url` if the app isn't on `localhost:3000`. Run `expect-cli --help` for all flags.

## Writing Instructions

Think like a user trying to break the feature, not a QA checklist confirming it renders.

**Bad:** `expect-cli -m "Check that the login form renders" -y`

**Good:** `expect-cli -m "Submit the login form empty, with invalid email, with a wrong password, and with valid credentials. Verify error messages for bad inputs and redirect on success. Check console errors after each." -y`

Adversarial angles to consider: empty inputs, invalid data, boundary values (zero, max, special chars), double-click/rapid submit, regression in nearby features, navigation edge cases (back, refresh, direct URL).

## When to Run

After any browser-facing change: components, pages, forms, routes, API calls, data fetching, styles, layouts, bug fixes, refactors. When in doubt, run it.

## Example

```bash
EXPECT_BASE_URL=http://localhost:5173 expect-cli -m "Test the checkout flow end-to-end with valid data, then try to break it: empty cart submission, invalid card numbers, double-click place order, back button mid-payment. Verify error states and console errors." -y
```

## After Failures

Read the failure output — it names the exact step and what broke. Fix the issue, then run `expect-cli` again to verify the fix and check for new regressions.
