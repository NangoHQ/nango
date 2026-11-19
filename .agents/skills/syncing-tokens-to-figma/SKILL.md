---
name: syncing-tokens-to-figma
description: Use after changing packages/design-system/tokens/tokens.json, or when asked to sync design tokens to Figma or Dharma - pushes the repo's tokens one way into the Dharma Figma library through the Figma MCP, showing the differences before anything is written
---

# Syncing design tokens to Figma

`packages/design-system/tokens/tokens.json` is the only source of design tokens. The Dharma Figma library mirrors it, matched by name. Nothing flows from Figma back to the repo.

Run the sync from the branch that changes the tokens, before the PR merges. Only run it if you have edit access to Dharma through the Figma MCP. If you don't, tell the user the tokens changed and still need syncing.

## Steps

1. Load the `figma-use` skill. Every `use_figma` call below uses the file key the script prints.

2. Build the script that reads Figma:

    ```bash
    npm run tokens:figma --workspace=@nangohq/design-system -- prepare-figma-diff
    ```

3. Pass the printed `prepare-figma-diff.js` file's full contents as `code` to `use_figma`. It only reads.

4. Save the JSON it returns to a file, then:

    ```bash
    npm run tokens:figma --workspace=@nangohq/design-system -- diff <figma-state.json>
    ```

    It prints what would change and writes `apply-N.js` files. `✓ Figma matches tokens.json` means you're done.

5. Handle renames first. A token renamed in `tokens.json` shows up as a `+ create` line plus a `?` line for its old name. Rename the old variable or style in Figma with `use_figma`, so components that use it stay connected, then go back to step 2.

6. Show the user the diff and wait for a yes. Then run each `apply-N.js` with `use_figma`, in order. Each returns `{ created, errors }`; fix any error and sync again.

7. Repeat steps 2–4. `diff` should report that Figma matches.

## Reading the diff

| Line | Meaning |
|---|---|
| `+ create variable color/danger/750` | Missing in Figma; apply creates it |
| `~ variable border/input: v {...} → {...}` | Figma value differs; apply overwrites it with the repo's |
| `~ variable surface/canvas: description` | Only the description differs |
| `? variable Colors/control/checkbox/border is in Figma but not in tokens.json` | Never deleted automatically. If it pairs with a `+ create`, it's a rename (step 5). Otherwise ask the user. |
| `! ...` | An error. Fix it before applying. |

A value change where Figma looks newer than the repo means someone edited Figma directly. Ask the user before overwriting it.

## Mapping

| tokens.json | Dharma |
|---|---|
| `Primitives` set | `Primitives` collection, one mode |
| `Semantic/Dark` and `Semantic/Light` | `Colors` collection, `Dark` and `Light` modes |
| `boxShadow` tokens | Effect styles named `<Primitives\|Dark\|Light>/<last path segment>` |
| `Typography` set | Text styles, bound to the typography variables |
| Token path `surface.canvas` | Variable or style name `surface/canvas` |
