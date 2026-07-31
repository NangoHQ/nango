import db from '@nangohq/database';
import { configService, getProviders } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { integrationToPublicApi } from '../formatters/integration.js';

import type { ApiPublicIntegration, GetPublicListIntegrations } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

type IntegrationServiceErrorCode = 'list_failed';

export class IntegrationServiceError extends Error {
    public code: IntegrationServiceErrorCode;

    constructor({ code, message, cause }: { code: IntegrationServiceErrorCode; message: string; cause?: unknown }) {
        super(message, { cause });
        this.name = 'IntegrationServiceError';
        this.code = code;
    }
}

class IntegrationService {
    async list({
        environmentId,
        allowedIntegrations
    }: {
        environmentId: number;
        allowedIntegrations?: string[] | null;
    }): Promise<Result<GetPublicListIntegrations['Success'], IntegrationServiceError>> {
        try {
            let configs = await configService.listProviderConfigs(db.knex, environmentId);

            const providers = getProviders();
            if (!providers) {
                return Err(
                    new IntegrationServiceError({
                        code: 'list_failed',
                        message: 'failed to load providers'
                    })
                );
            }

            if (allowedIntegrations) {
                configs = configs.filter((config) => allowedIntegrations.includes(config.unique_key));
            }

            const data: ApiPublicIntegration[] = [];
            for (const config of configs) {
                const provider = providers[config.provider];
                if (!provider) {
                    return Err(
                        new IntegrationServiceError({
                            code: 'list_failed',
                            message: 'Failed to list integrations',
                            cause: new Error(`Provider '${config.provider}' does not exist`)
                        })
                    );
                }
                data.push(integrationToPublicApi({ integration: config, provider }));
            }

            return Ok({ data });
        } catch (err) {
            return Err(
                new IntegrationServiceError({
                    code: 'list_failed',
                    message: 'Failed to list integrations',
                    cause: err
                })
            );
        }
    }
}

export default new IntegrationService();
