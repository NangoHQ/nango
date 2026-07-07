import type { Endpoint } from '../api.js';

export type CliTelemetryEvent =
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

export type PostCliTelemetry = Endpoint<{
    Method: 'POST';
    Path: '/cli/telemetry';
    Body: {
        deviceId: string;
        event: CliTelemetryEvent;
        // True when deviceId is a throwaway id that couldn't be persisted, so it shouldn't be treated as a stable device.
        ephemeral?: boolean;
    };
    Success: never;
}>;
