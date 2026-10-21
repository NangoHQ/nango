import type { NangoProps as NodeNangoProps } from '@nangohq/node';
import type { NangoProps } from '@nangohq/types';

/** The credential persist and the API should see: the task token when jobs minted one, otherwise the secret. */
export function runnerBearer(props: Pick<NangoProps, 'secretKey' | 'taskAuthToken'>): string {
    if (props.taskAuthToken) {
        return props.taskAuthToken;
    }
    if (props.secretKey) {
        return props.secretKey;
    }
    throw new Error('runner has neither a task token nor a secret key');
}

/** `@nangohq/node` gets `apiKey` for a task token and `secretKey` otherwise, never both. */
export function nangoClientConfig(props: NangoProps, opts: { isSync: boolean; dryRun: boolean }): NodeNangoProps {
    const shared = {
        ...(props.host ? { host: props.host } : {}),
        connectionId: props.connectionId,
        providerConfigKey: props.providerConfigKey,
        ...(props.activityLogId ? { activityLogId: props.activityLogId } : {}),
        isSync: opts.isSync,
        dryRun: opts.dryRun,
        isScript: true as const
    };
    if (props.taskAuthToken) {
        return { ...shared, apiKey: props.taskAuthToken };
    }
    if (!props.secretKey) {
        throw new Error('runner has neither a task token nor a secret key');
    }
    return { ...shared, secretKey: props.secretKey };
}
