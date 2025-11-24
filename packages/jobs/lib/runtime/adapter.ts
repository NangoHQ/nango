import type { NangoProps } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export interface RuntimeAdapter {
    canHandle(nangoProps: NangoProps): boolean;
    invoke(params: { taskId: string; nangoProps: NangoProps; code: string; codeParams: object }): Promise<Result<boolean>>;
    cancel(params: { taskId: string; nangoProps: NangoProps }): Promise<Result<boolean>>;
}
