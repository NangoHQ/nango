import { Ok } from '@nangohq/utils';

import type { RuntimeAdapter } from '../../../runtime-adapter.js';
import type { NangoProps, Result } from '@nangohq/types';

export class KubernetesJobRuntimeAdapter implements RuntimeAdapter {
    canHandle(_nangoProps: NangoProps): boolean {
        return false;
    }

    async invoke(_params: { taskId: string; nangoProps: NangoProps; code: string; codeParams: object }): Promise<Result<boolean>> {
        return Promise.resolve(Ok(true));
    }

    async cancel(_params: { taskId: string; nangoProps: NangoProps }): Promise<Result<boolean>> {
        return Promise.resolve(Ok(true));
    }
}
