import { FeatureFlags, createKVStore } from '@nangohq/kvstore';
import type { RunnerFlags } from '@nangohq/types';

const featureFlags = new FeatureFlags(await createKVStore());

export async function getRunnerFlags(): Promise<RunnerFlags> {
    const [validateActionInput, validateActionOutput, validateSyncRecords, validateSyncMetadata] = await Promise.all([
        featureFlags.isEnabled({ key: 'runner.validateActionInput', distinctId: 'global', fallback: false }),
        featureFlags.isEnabled({ key: 'runner.validateActionOutput', distinctId: 'global', fallback: false }),
        featureFlags.isEnabled({ key: 'runner.validateSyncRecords', distinctId: 'global', fallback: false }),
        featureFlags.isEnabled({ key: 'runner.validateSyncMetadata', distinctId: 'global', fallback: false })
    ]);

    console.log('hello', validateActionInput);

    return {
        validateActionInput,
        validateActionOutput,
        validateSyncRecords,
        validateSyncMetadata
    };
}
