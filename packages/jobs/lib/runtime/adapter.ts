import type { NangoProps, RuntimeContext } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export interface RuntimeAdapter {
    invoke(params: {
        taskId: string;
        nangoProps: NangoProps;
        code: string;
        codeParams: object;
        runtimeContext?: RuntimeContext | undefined;
    }): Promise<Result<boolean>>;
    cancel(params: { taskId: string; nangoProps: NangoProps }): Promise<Result<boolean>>;
}
