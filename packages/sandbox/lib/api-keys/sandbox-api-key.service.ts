import { createSandboxApiKeyToken, createSandboxSigningSecret, decryptSandboxSigningSecret, encryptSandboxSigningSecret } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { DBCustomerKey, Result } from '@nangohq/types';
import type { Knex } from 'knex';

const customerKeysTable = 'customer_keys';
const customerKeysRelationsTable = 'customer_keys_relations';

export {
    buildSandboxApiKeyScopes,
    createSandboxApiKeyToken,
    createSandboxSigningSecret,
    decryptSandboxSigningSecret,
    encryptSandboxSigningSecret,
    isSandboxApiKey,
    parseSandboxApiKeyToken,
    sandboxApiKeyAudience,
    sandboxApiKeyBaseScopes,
    sandboxApiKeyPrefix,
    sandboxApiKeyPurposes,
    verifySandboxApiKeyToken
} from '@nangohq/shared';
export type { SandboxApiKeyPurpose } from '@nangohq/shared';

interface CreateSandboxApiKeyBase {
    parentApiKeyId: number;
    environmentId: number;
    expiresAt: Date;
}

interface CreateDryrunSandboxApiKey extends CreateSandboxApiKeyBase {
    purpose: 'dryrun';
    dryrunId: string;
}

interface CreateDeploySandboxApiKey extends CreateSandboxApiKeyBase {
    purpose: 'deploy';
    deploymentId: string;
}

type CreateSandboxApiKeyArgs = CreateDryrunSandboxApiKey | CreateDeploySandboxApiKey;

class SandboxApiKeyService {
    public async createSandboxApiKey(trx: Knex, args: CreateSandboxApiKeyArgs): Promise<Result<string>> {
        try {
            const { parentApiKeyId, environmentId, expiresAt } = args;
            const now = Date.now();
            const expiresAtMs = expiresAt.getTime();
            if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
                return Err(new Error('Sandbox API key expiresAt must be in the future'));
            }

            // Sandbox API keys are meant to stay short-lived; this cap can be modified if there is a good reason.
            const maxExpiresAt = new Date(now + 24 * 60 * 60 * 1000); // 24 hours
            const cappedExpiresAt = expiresAtMs > maxExpiresAt.getTime() ? maxExpiresAt : expiresAt;

            const token = await trx.transaction(async (innerTrx) => {
                const parentKey = await innerTrx<DBCustomerKey>(customerKeysTable)
                    .select(`${customerKeysTable}.*`)
                    .join(customerKeysRelationsTable, `${customerKeysRelationsTable}.customer_key_id`, `${customerKeysTable}.id`)
                    .where(`${customerKeysTable}.id`, parentApiKeyId)
                    .where(`${customerKeysTable}.key_type`, 'api')
                    .where(`${customerKeysRelationsTable}.entity_type`, 'environment')
                    .where(`${customerKeysRelationsTable}.entity_id`, environmentId)
                    .whereNull(`${customerKeysTable}.deleted_at`)
                    .forUpdate()
                    .first();

                if (!parentKey) {
                    throw Object.assign(new Error('Sandbox API key parent customer key was not found'), {
                        type: 'no_such_api_secret',
                        payload: { id: parentApiKeyId }
                    });
                }

                let signingSecret = decryptSandboxSigningSecret(parentKey);
                if (!signingSecret) {
                    signingSecret = createSandboxSigningSecret();
                    await innerTrx<DBCustomerKey>(customerKeysTable)
                        .where(`${customerKeysTable}.id`, parentApiKeyId)
                        .update({
                            ...encryptSandboxSigningSecret(signingSecret),
                            updated_at: innerTrx.fn.now() as unknown as Date
                        });
                }

                return createSandboxApiKeyToken({
                    parentApiKeyId: parentKey.id,
                    signingSecret,
                    ...(args.purpose === 'dryrun'
                        ? { purpose: args.purpose, dryrunId: args.dryrunId }
                        : { purpose: args.purpose, deploymentId: args.deploymentId }),
                    expiresAt: cappedExpiresAt
                });
            });

            return Ok(token);
        } catch (err) {
            return Err(err);
        }
    }
}

export default new SandboxApiKeyService();
