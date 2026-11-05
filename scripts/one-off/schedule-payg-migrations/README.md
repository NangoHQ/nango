# Schedule pay-as-you-go migrations

Schedules eligible Orb subscriptions to move to the pay-as-you-go plan at the end of their current term, unless a CSV row specifies a migration date. For rows with `with_growth_addon=true`, it also schedules the Growth add-on for the same time and records a local Growth activation date six hours before that transition in `plans.growth_features_starts_at`.

## Prerequisites

- Set `ORB_API_KEY` to the Orb API key for the environment you intend to target.
- Set `NANGO_DATABASE_URL` to the Nango database URL for the environment you intend to target.
- Prepare a CSV with this exact structure:

```csv
account_id,current_plan,with_growth_addon,migration_date,override_scheduled_plan_change
123,growth-legacy,true,,false
456,starter-legacy,false,2026-10-15,true
```

`migration_date` is optional per row. Leave it empty to schedule at the end of the current subscription term; otherwise provide a valid `YYYY-MM-DD` date.

Set `override_scheduled_plan_change` to `true` only to replace an existing pending or future Orb plan change. On execution, the script unschedules Orb's pending plan changes before scheduling the CSV row's replacement. It remains a dry-run operation until `--execute` is supplied.

For rows with `with_growth_addon=true`, the Growth add-on always follows Orb's actual PAYG plan-change timestamp. The CSV `migration_date` is used when creating or replacing a plan change; if the script retains an existing PAYG change because `override_scheduled_plan_change=false`, its Orb date takes precedence even when it differs from the CSV date.

## Run

Always run a dry-run first. It reads Orb and prints every candidate, skipped row, and failure, but does not schedule changes:

```sh
ORB_API_KEY=... NANGO_DATABASE_URL=... npx tsx scripts/one-off/schedule-payg-migrations/schedule.ts ./customers.csv
```

After reviewing the output, execute the schedules:

```sh
ORB_API_KEY=... NANGO_DATABASE_URL=... npx tsx scripts/one-off/schedule-payg-migrations/schedule.ts ./customers.csv --execute
```

The script skips accounts with no or multiple active subscriptions or a CSV/Orb current-plan mismatch. Plan and Growth add-on scheduling are independently idempotent: an existing plan change does not create another one unless `override_scheduled_plan_change=true`, and an existing active or future Growth interval does not create another add-on. For an existing scheduled Growth interval, the script verifies that Nango has the same activation date; a mismatch is reported as a failure and is not overwritten.

Schedule calls are throttled by 2 seconds by default. Change the delay, or pass `0` to disable it, with `--throttle-ms`:

```sh
ORB_API_KEY=... NANGO_DATABASE_URL=... npx tsx scripts/one-off/schedule-payg-migrations/schedule.ts ./customers.csv --execute --throttle-ms=5000
```
