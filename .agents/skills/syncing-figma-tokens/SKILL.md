---
name: syncing-figma-tokens
description: Use after changing packages/design-system/tokens/tokens.json, or when asked to sync design tokens to Figma or Dharma - pushes the repo's tokens one way into the Dharma Figma library through the Figma MCP, with a check before anything is written
---

# Syncing design tokens to Figma

`packages/design-system/tokens/tokens.json` is the only source of design tokens. The Dharma Figma library mirrors it. Token values never flow from Figma back to the repo. Only two things do: the Figma keys of variables and styles the sync creates, and, once, the descriptions Dharma already had (step 5).

Run the sync from the branch that changes the tokens, before the PR merges, so the new keys land in the same PR. Only run it if you have edit access to Dharma through the Figma MCP. If you don't, tell the user the tokens changed and still need syncing.

## Steps

1. Load the `figma-use` skill. Every `use_figma` call below uses the file key the script prints.

2. Build the check:

    ```bash
    npm run tokens:figma --workspace=@nangohq/design-system -- check
    ```

3. Pass the printed `check.js` file's full contents as `code` to `use_figma`. It only reads.

4. Save the JSON it returns to a file, then:

    ```bash
    npm run tokens:figma --workspace=@nangohq/design-system -- diff <check-result.json>
    ```

    It prints what would change and writes `apply-N.js` files. `✓ Figma matches tokens.json` means you're done.

5. **First sync only:** if `tokens.json` has no `$description` on most tokens, copy Dharma's descriptions in, or the apply erases them. Then run `diff` again.

    ```bash
    npm run tokens:figma --workspace=@nangohq/design-system -- pull-descriptions <check-result.json>
    ```

    It fills only empty descriptions. Where both sides have one, it keeps the repo's and lists the token.

6. Show the user the diff and wait for a yes. Then run each `apply-N.js` with `use_figma`, in order, and save each JSON result.

7. Record the keys of anything created, and drop stale ones. With no `apply-N.js` files, run it with no arguments:

    ```bash
    npm run tokens:figma --workspace=@nangohq/design-system -- write-keys [apply-1.json apply-2.json ...]
    ```

    Commit the `tokens.json` change with the token change.

8. Run the check again. It should report nothing changed.

## Reading the diff

| Line | Meaning |
|---|---|
| `+ create variable color/danger/750` | Missing in Figma; apply creates it |
| `~ variable border/input: v {...} → {...}` | Figma value differs; apply overwrites it with the repo's |
| `~ variable surface/canvas: description` | Only the description differs |
| `? variable Colors/control/checkbox/border is in Figma but not in tokens.json` | Never deleted automatically. Ask the user. |
| `! ...` | An error. Fix it before applying. |

A value change where Figma looks newer than the repo means someone edited Figma directly. Ask the user before overwriting it.

## Mapping

| tokens.json | Dharma |
|---|---|
| `Primitives` set | `Primitives` collection, one mode |
| `Semantic/Dark` and `Semantic/Light` | `Colors` collection, `Dark` and `Light` modes |
| `boxShadow` tokens | Effect styles named `<Primitives\|Dark\|Light>/<last path segment>` |
| `Typography` set | Text styles, bound to the typography variables |
| `$themes[].$figmaVariableReferences` / `$figmaStyleReferences` | Figma keys, so renames keep component bindings |
