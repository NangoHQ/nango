# Schedule pay-as-you-go migrations

Schedules eligible Orb subscriptions to move to the pay-as-you-go plan at the end of their current term. For rows with `with_growth_addon=true`, it also schedules the Growth add-on at the end of the term and records a local Growth activation date six hours before that transition in `plans.growth_features_starts_at`.

## Prerequisites

- Set `ORB_API_KEY` to the Orb API key for the environment you intend to target.
- Set `NANGO_DATABASE_URL` to the Nango database URL for the environment you intend to target.
- Prepare a CSV with this exact structure:

```csv
account_id,current_plan,with_growth_addon
123,growth-legacy,true
456,starter-legacy,false
```

## Run

Always run a dry-run first. It reads Orb and prints every candidate, skipped row, and failure, but does not schedule changes:

```sh
ORB_API_KEY=... NANGO_DATABASE_URL=... npx tsx scripts/one-off/schedule-payg-migrations/schedule.ts ./customers.csv
```

After reviewing the output, execute the schedules:

```sh
ORB_API_KEY=... NANGO_DATABASE_URL=... npx tsx scripts/one-off/schedule-payg-migrations/schedule.ts ./customers.csv --execute
```

The script skips accounts with no or multiple active subscriptions or a CSV/Orb current-plan mismatch. Plan and Growth add-on scheduling are independently idempotent: an existing plan change does not create another one, and an existing active or future Growth interval does not create another add-on. For an existing scheduled Growth interval, the script verifies that Nango has the same activation date; a mismatch is reported as a failure and is not overwritten. It never cancels or replaces an existing change.

Schedule calls are throttled by 2 seconds by default. Change the delay, or pass `0` to disable it, with `--throttle-ms`:

```sh
ORB_API_KEY=... NANGO_DATABASE_URL=... npx tsx scripts/one-off/schedule-payg-migrations/schedule.ts ./customers.csv --execute --throttle-ms=5000
```
