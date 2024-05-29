import type { RecentlyCreatedConnection } from '@nangohq/shared';
import type { LogContextGetter } from '@nangohq/logs';

export async function externalPostConnection(
    createdConnection: RecentlyCreatedConnection,
    provider: string,
    logContextGetter: LogContextGetter
): Promise<void> {
    console.log(createdConnection, provider, logContextGetter);
}
