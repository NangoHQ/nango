import type { ApiEndpoint } from '../api.js';

export type CliTelemetryCommand =
    | 'init'
    | 'create'
    | 'compile'
    | 'dev'
    | 'dryrun'
    | 'generate:docs'
    | 'generate:tests'
    | 'clone'
    | 'migrate-to-zero-yaml'
    | 'deploy'
    | 'pull';

/** Released CLIs still send these, so the endpoint keeps accepting them. */
export type LegacyCliTelemetryEvent =
    | 'cli:init'
    | 'cli:create'
    | 'cli:compile'
    | 'cli:dev'
    | 'cli:dryrun'
    | 'cli:generate:docs'
    | 'cli:generate:tests'
    | 'cli:clone'
    | 'cli:migrate_to_zero_yaml'
    | 'cli:deploy'
    | 'cli:pull';

export type PostCliTelemetry = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'POST';
    Path: '/cli/telemetry';
    Body: {
        deviceId: string;
        // True when deviceId is a throwaway id that couldn't be persisted, so it shouldn't be treated as a stable device.
        ephemeral?: boolean;
    } & ({ command: CliTelemetryCommand; event?: never } | { event: LegacyCliTelemetryEvent; command?: never });
    Success: never;
}>;
