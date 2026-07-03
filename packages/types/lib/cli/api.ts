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
        properties?: Record<string, string | number | boolean> | undefined;
    };
    Success: never;
}>;
