import { randomUUID } from 'crypto';

import Conf from 'conf';

const schema = {
    lastIgnoreUpgrade: {
        type: 'number'
    },
    deviceId: {
        type: 'string'
    }
};
export const state = new Conf({ projectName: 'nango', schema });

export function getDeviceId(): { deviceId: string; ephemeral: boolean } {
    try {
        let deviceId = state.get('deviceId') as string | undefined;
        if (!deviceId) {
            deviceId = randomUUID();
            state.set('deviceId', deviceId);
        }
        return { deviceId, ephemeral: false };
    } catch {
        // ephemeral means the id couldn't be persisted (e.g. read-only FS), so it's a throwaway
        // that can't correlate across runs. Callers should flag it and skip device correlation.
        return { deviceId: randomUUID(), ephemeral: true };
    }
}
