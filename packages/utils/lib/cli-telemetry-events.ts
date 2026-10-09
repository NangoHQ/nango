import type { CliTelemetryCommand, LegacyCliTelemetryEvent } from '@nangohq/types';

export const cliTelemetryCommands = [
    'init',
    'create',
    'compile',
    'dev',
    'dryrun',
    'generate:docs',
    'generate:tests',
    'clone',
    'migrate-to-zero-yaml',
    'deploy',
    'pull'
] as const satisfies readonly CliTelemetryCommand[];

// The `satisfies` above rejects entries that aren't valid `CliTelemetryCommand`s;
// the assertion below rejects any `CliTelemetryCommand` missing from this array.
// Together they keep the two lists in sync.
true satisfies [Exclude<CliTelemetryCommand, (typeof cliTelemetryCommands)[number]>] extends [never] ? true : never;

export const legacyCliTelemetryEvents: Record<LegacyCliTelemetryEvent, CliTelemetryCommand> = {
    'cli:init': 'init',
    'cli:create': 'create',
    'cli:compile': 'compile',
    'cli:dev': 'dev',
    'cli:dryrun': 'dryrun',
    'cli:generate:docs': 'generate:docs',
    'cli:generate:tests': 'generate:tests',
    'cli:clone': 'clone',
    'cli:migrate_to_zero_yaml': 'migrate-to-zero-yaml',
    'cli:deploy': 'deploy',
    'cli:pull': 'pull'
};
