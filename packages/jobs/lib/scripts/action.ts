import { Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { StartActionScriptProps } from './types';
import type { LogContext } from '@nangohq/logs';

export async function startAction(props: StartActionScriptProps & { logCtx: LogContext }): Promise<Result<void>> {
    console.log(props);
    await new Promise((resolve) => setTimeout(resolve, 1));
    return Ok(undefined);
}
