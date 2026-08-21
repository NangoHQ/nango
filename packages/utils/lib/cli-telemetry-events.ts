import type { CliTelemetryEvent } from '@nangohq/types';

export const cliTelemetryEvents = [
    'cli:init',
    'cli:create',
    'cli:compile',
    'cli:dev',
    'cli:dryrun',
    'cli:generate:docs',
    'cli:generate:tests',
    'cli:clone',
    'cli:migrate_to_zero_yaml',
    'cli:deploy',
    'cli:pull'
] as const satisfies readonly CliTelemetryEvent[];

// The `satisfies` above rejects entries that aren't valid `CliTelemetryEvent`s;
// the assertion below rejects any `CliTelemetryEvent` missing from this array.
// Together they keep the two lists in sync.
true satisfies [Exclude<CliTelemetryEvent, (typeof cliTelemetryEvents)[number]>] extends [never] ? true : never;
