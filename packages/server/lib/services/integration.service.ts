import db from '@nangohq/database';
import { configService, getProviders } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { IntegrationConfig, Provider } from '@nangohq/types';
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

export interface ListedIntegration {
    integration: IntegrationConfig;
    provider: Provider;
}

class IntegrationService {
    async list({
        environmentId,
        allowedIntegrations
    }: {
        environmentId: number;
        allowedIntegrations?: string[] | null;
    }): Promise<Result<ListedIntegration[], IntegrationServiceError>> {
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

            const integrations: ListedIntegration[] = [];
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
                integrations.push({ integration: config, provider });
            }

            return Ok(integrations);
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
