import { Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { StartPostConnectionScriptProps } from './types';
import type { LogContext } from '@nangohq/logs';

export async function startPostConnection(props: StartPostConnectionScriptProps & { logCtx: LogContext }): Promise<Result<void>> {
    console.log(props);
    await new Promise((resolve) => setTimeout(resolve, 1));
    return Ok(undefined);
}
