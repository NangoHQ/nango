import { onEventScriptService } from '../services/on-event-scripts.service.js';

import type { DBEnvironment, DBTeam, OnEventScript, OnEventScriptsByProvider } from '@nangohq/types';

export async function createOnEventScript({
    account,
    environment,
    providerConfigKey,
    sdkVersion
}: {
    account: DBTeam;
    environment: DBEnvironment;
    providerConfigKey: string;
    sdkVersion: string | undefined;
}): Promise<OnEventScript> {
    const scripts: OnEventScriptsByProvider[] = [
        {
            providerConfigKey,
            scripts: [
                {
                    name: 'test-script',
                    event: 'post-connection-creation',
                    fileBody: { js: '', ts: '' }
                }
            ]
        }
    ];
    const [added] = await onEventScriptService.update({
        environment,
        account,
        onEventScriptsByProvider: scripts,
        sdkVersion
    });
    if (!added) {
        throw new Error('failed_to_create_on_event_script');
    }
    return added;
}
