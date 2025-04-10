import environmentService from '../services/environment.service.js';

import type { DBEnvironment } from '@nangohq/types';

export async function createEnvironmentSeed(accountId: number = 0, envName: string = 'test'): Promise<DBEnvironment> {
    const env = await environmentService.createEnvironment(accountId, envName);
    if (!env) {
        throw new Error('Failed to create environment');
    }
    return env;
}

export function getTestEnvironment(data?: Partial<DBEnvironment>): DBEnvironment {
    return {
        id: 1,
        account_id: 1,
        always_send_webhook: false,
        callback_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        hmac_enabled: false,
        hmac_digest: null,
        hmac_key: null,
        name: 'test',
        otlp_settings: null,
        pending_public_key: null,
        pending_secret_key: null,
        pending_secret_key_iv: null,
        pending_secret_key_tag: null,
        public_key: '',
        public_key_rotatable: false,
        secret_key: '',
        secret_key_hashed: '',
        secret_key_iv: '',
        secret_key_rotatable: false,
        secret_key_tag: '',
        send_auth_webhook: false,
        slack_notifications: false,
        uuid: 'ad49e079-ba61-44ae-b0cf-823662523527',
        webhook_receive_url: null,
        websockets_path: null,
        webhook_url: null,
        webhook_url_secondary: null,
        deleted: false,
        ...data
    };
}
