import { getLogger, stringifyError } from '@nangohq/utils';

import { SandboxInitializationError, SandboxUnavailableError } from './providers/errors.js';
import { createSandboxProvider } from './providers/factory.js';

import type { CreateSandboxParams, Sandbox, SandboxProvider } from './providers/types.js';

const logger = getLogger('SandboxService');

export class SandboxService {
    constructor(private readonly provider: SandboxProvider = createSandboxProvider()) {}

    async create(params: CreateSandboxParams): Promise<Sandbox> {
        try {
            return await this.provider.create(params);
        } catch (err) {
            if (err instanceof SandboxUnavailableError) {
                logger.warning('Function execution environment unavailable', {
                    provider: this.provider.name,
                    purpose: params.purpose,
                    err: stringifyError(err)
                });
                throw err;
            }

            logger.error('Failed to initialize sandbox', {
                provider: this.provider.name,
                purpose: params.purpose,
                err: stringifyError(err, { stack: true, cause: true })
            });

            throw new SandboxInitializationError({ cause: err });
        }
    }

    async cleanup(params: { sandboxId: string | null | undefined }): Promise<void> {
        if (!params.sandboxId) {
            return;
        }

        try {
            await this.provider.cleanup(params.sandboxId);
        } catch (err) {
            logger.warning('Failed to clean up sandbox', {
                sandboxId: params.sandboxId,
                provider: this.provider.name,
                err: stringifyError(err)
            });
        }
    }
}

export const sandboxService = new SandboxService();
