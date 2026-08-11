# Rotate webhook signing key

There is no supported rotate/regenerate flow for the `webhook_signing` key yet — this is a manual
runbook script until that's built. It soft-deletes the environment's current `webhook_signing` row
in `customer_keys` and inserts a new one, encrypted the same way `createWebhookSigningKey` does.

Uses `.env` to figure out the DB connection and `NANGO_ENCRYPTION_KEY`.

## Run

Dry run first (no writes, just shows what would happen):

```bash
npx tsx scripts/one-off/rotate-webhook-signing-key/rotate.ts --account-id=<id> --environment-id=<id>
```

Actually rotate:

```bash
npx tsx scripts/one-off/rotate-webhook-signing-key/rotate.ts --account-id=<id> --environment-id=<id> --yes
```

The new plaintext secret is printed once at the end — copy it immediately, it cannot be recovered
from the DB afterward (only the encrypted form is stored).

## After running

`packages/server` and `packages/jobs` each cache this key in an in-memory `Map` with no eviction.
**Restart every replica of both services** before telling the customer to switch to the new secret
— otherwise some replicas will keep signing outgoing webhooks with the old key.

## Options

- `--yes` actually performs the delete + insert. Without it, the script only prints the environment
  and existing key row(s) it would touch.
