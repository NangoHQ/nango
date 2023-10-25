import type { NextFunction, Request, Response } from 'express';
import { configService } from '@nangohq/shared';

class ProviderController {
    /**
     * Webapp
     */

    async listProviders(req: Request, res: Response, next: NextFunction) {
        try {
            let templates = configService.templates ?? {};
            const query = req.query['query'] as string | undefined;
            const limit = parseInt((req.query['limit'] as string) ?? '10');

            if (query) {
                templates = Object.fromEntries(
                    Object.entries(templates).filter((entry) => {
                        return entry[0].toLowerCase().includes(query.toLowerCase());
                    })
                );
            }

            templates = Object.fromEntries(Object.entries(templates).slice(0, limit));

            res.status(200).send({
                providers: templates
            });
        } catch (err) {
            next(err);
        }
    }

    async getProvider(req: Request, res: Response, next: NextFunction) {
        try {
            const providerKey = req.params['provider'] as string;

            res.status(200).send({
                provider: configService.templates?.[providerKey]
            });
        } catch (err) {
            next(err);
        }
    }
}

export default new ProviderController();
