import type { DeployRequest } from './deploy-client.js';
import type { DryrunRequest } from './dryrun-client.js';

export function buildDryrunArgs(request: DryrunRequest): string[] {
    const args = [
        'dryrun',
        request.function_name,
        request.connection_id,
        '--environment',
        request.environment_name,
        '--integration-id',
        request.integration_id,
        '--auto-confirm',
        '--no-interactive'
    ];

    if (request.input !== undefined) {
        args.push('--input', '@/tmp/nango-dryrun-input.json');
    }
    if (request.metadata) {
        args.push('--metadata', '@/tmp/nango-dryrun-metadata.json');
    }
    if (request.checkpoint) {
        args.push('--checkpoint', '@/tmp/nango-dryrun-checkpoint.json');
    }
    if (request.last_sync_date) {
        args.push('--lastSyncDate', request.last_sync_date);
    }

    return args;
}

export function buildDeployArgs(request: DeployRequest): string[] {
    return [
        'deploy',
        request.environment_name,
        '--integration',
        request.integration_id,
        request.function_type === 'action' ? '--action' : '--sync',
        request.function_name,
        '--auto-confirm',
        '--allow-destructive',
        '--no-interactive'
    ];
}
