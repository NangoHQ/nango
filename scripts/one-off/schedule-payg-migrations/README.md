# Schedule pay-as-you-go migrations

Schedules eligible Orb subscriptions to move to the pay-as-you-go plan at the end of their current term. It does not update Nango's database: Orb's `subscription.plan_change_scheduled` webhook records the future plan and date.

The script validates, but deliberately ignores, `with_growth_addon`. Growth add-on migration is a separate follow-up.

## Prerequisites

- Set `ORB_API_KEY` to the Orb API key for the environment you intend to target.
- Prepare a CSV with this exact structure:

```csv
account_id,current_plan,with_growth_addon
123,growth-legacy,true
456,starter-legacy,false
```

## Run

Always run a dry-run first. It reads Orb and prints every candidate, skipped row, and failure, but does not schedule changes:

```sh
ORB_API_KEY=... npx tsx scripts/one-off/schedule-payg-migrations/schedule.ts ./customers.csv
```

After reviewing the output, execute the schedules:

```sh
ORB_API_KEY=... npx tsx scripts/one-off/schedule-payg-migrations/schedule.ts ./customers.csv --execute
```

The script skips accounts with no or multiple active subscriptions, a CSV/Orb current-plan mismatch, an existing pay-as-you-go plan, a pending Orb change, or any future plan change already recorded in the Orb subscription schedule. It never cancels or replaces an existing change.

Schedule calls are throttled by 2 seconds by default. Change the delay, or pass `0` to disable it, with `--throttle-ms`:

```sh
ORB_API_KEY=... npx tsx scripts/one-off/schedule-payg-migrations/schedule.ts ./customers.csv --execute --throttle-ms=5000
```
