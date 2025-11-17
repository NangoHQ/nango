import { Ok } from '@nangohq/utils';

import { updateTask } from '../../utils/tasks.js';

import type { RuntimeAdapter } from '../../runtime-adapter.js';
import type { NangoProps, Result } from '@nangohq/types';

export class CloudflareRuntimeAdapter implements RuntimeAdapter {
    canHandle(nangoProps: NangoProps): boolean {
        return nangoProps.scriptType === 'action';
    }

    async invoke(params: { taskId: string; nangoProps: NangoProps; code: string; codeParams: object }): Promise<Result<boolean>> {
        const payload = {
            connectionId: params.nangoProps.connectionId,
            providerConfigKey: params.nangoProps.providerConfigKey,
            event: params.codeParams
        };
        const response = await fetch(String(process.env['CLOUDFLARE_DISPATCHER_URL']), {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const isSuccess = response.status === 200;
        const output = response.body ? await response.json() : null;
        await updateTask({
            taskId: params.taskId,
            nangoProps: params.nangoProps,
            isSuccess,
            output
        });
        return Promise.resolve(Ok(true));
    }

    async cancel(_params: { taskId: string; nangoProps: NangoProps }): Promise<Result<boolean>> {
        return Promise.resolve(Ok(true));
    }
}
