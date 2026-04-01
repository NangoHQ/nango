import type { NangoProps, RoutingContext } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export interface RuntimeAdapter {
    invoke(params: {
        taskId: string;
        nangoProps: NangoProps;
        code: string;
        codeParams: object;
        routingContext?: RoutingContext | undefined;
    }): Promise<Result<boolean>>;
    cancel(params: { taskId: string; nangoProps: NangoProps }): Promise<Result<boolean>>;
}
