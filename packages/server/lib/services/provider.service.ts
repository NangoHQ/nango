import { getProvider } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import flowService from './flow.service.js';

import type { NangoSyncConfig, Provider } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export type GetProviderServiceErrorCode = 'not_found' | 'get_failed' | 'list_templates_failed';
export type ListProviderTemplatesServiceErrorCode = 'list_templates_failed';
export type ProviderServiceErrorCode = GetProviderServiceErrorCode | ListProviderTemplatesServiceErrorCode;

export class ProviderServiceError<TCode extends ProviderServiceErrorCode = ProviderServiceErrorCode> extends Error {
    public readonly code: TCode;

    constructor({ code, message, cause }: { code: TCode; message: string; cause?: unknown }) {
        super(message, { cause });
        this.name = 'ProviderServiceError';
        this.code = code;
    }
}

export type GetProviderServiceError = ProviderServiceError<GetProviderServiceErrorCode>;
export type ListProviderTemplatesServiceError = ProviderServiceError<ListProviderTemplatesServiceErrorCode>;

export interface RetrievedProvider {
    name: string;
    provider: Provider;
    templates?: NangoSyncConfig[] | undefined;
}

export class ProviderService {
    get({
        providerName,
        includeTemplates = false,
        language
    }: {
        providerName: string;
        includeTemplates?: boolean;
        language?: string | undefined;
    }): Result<RetrievedProvider, GetProviderServiceError> {
        try {
            const provider = getProvider(providerName, language);
            if (!provider) {
                return Err(
                    new ProviderServiceError({
                        code: 'not_found',
                        message: `Unknown provider ${providerName}`
                    })
                );
            }

            if (!includeTemplates) {
                return Ok({ name: providerName, provider });
            }

            const templates = this.listTemplates({ providerName });
            if (templates.isErr()) {
                return Err(templates.error);
            }

            return Ok({ name: providerName, provider, templates: templates.value });
        } catch (err) {
            return Err(
                new ProviderServiceError({
                    code: 'get_failed',
                    message: 'Failed to get provider',
                    cause: err
                })
            );
        }
    }

    listTemplates({ providerName }: { providerName: string }): Result<NangoSyncConfig[], ListProviderTemplatesServiceError> {
        try {
            const entry = flowService.getAllAvailableFlowsAsStandardConfig().find((value) => value.providerConfigKey === providerName);
            return Ok(entry ? [...entry.actions, ...entry.syncs] : []);
        } catch (err) {
            return Err(
                new ProviderServiceError({
                    code: 'list_templates_failed',
                    message: 'Failed to list provider templates',
                    cause: err
                })
            );
        }
    }
}

export default new ProviderService();
