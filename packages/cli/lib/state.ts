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

export function getDeviceId(): string {
    let deviceId = state.get('deviceId') as string | undefined;
    if (!deviceId) {
        deviceId = randomUUID();
        state.set('deviceId', deviceId);
    }
    return deviceId;
}
