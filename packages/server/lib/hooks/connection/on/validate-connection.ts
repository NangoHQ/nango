import { NangoError, onEventScriptService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { getOrchestrator } from '../../../utils/utils.js';

import type { LogContext } from '@nangohq/logs';
import type { Config } from '@nangohq/shared';
import type { DBConnection, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export async function validateConnection({
    connection,
    config,
    account,
    logCtx
}: {
    config: Config;
    connection: DBConnection;
    account: DBTeam;
    logCtx: LogContext;
}): Promise<Result<{ tested: boolean }, NangoError>> {
    if (!config.id) {
        return Ok({ tested: false });
    }
    const event = 'validate-connection';

    const validateConnectionScripts = await onEventScriptService.getByConfig(config.id, event);

    if (validateConnectionScripts.length === 0) {
        return Ok({ tested: false });
    }

    for (const script of validateConnectionScripts) {
        const { name, file_location: fileLocation, version } = script;

        const res = await getOrchestrator().triggerOnEventScript({
            accountId: account.id,
            connection: {
                id: connection.id,
                connection_id: connection.connection_id,
                provider_config_key: config.unique_key,
                environment_id: config.environment_id
            },
            version,
            name,
            fileLocation,
            sdkVersion: script.sdk_version,
            async: false,
            logCtx
        });

        if (res.isErr()) {
            await logCtx.failed();
            return Err(new NangoError('connection_test_failed', { err: res.error }));
        }
    }

    return Ok({ tested: true });
}
