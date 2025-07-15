import { getProvider, getProviders } from '@nangohq/shared';

import type { RequestLocals } from '../utils/express.js';
import type { NextFunction, Request, Response } from 'express';

class ProviderController {
    /**
     * Webapp
     */

    listProviders(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            let templates = getProviders();
            const query = req.query['query'] as string | undefined;

            if (query) {
                templates = Object.fromEntries(
                    Object.entries(templates!).filter((entry) => {
                        return entry[0].toLowerCase().includes(query.toLowerCase());
                    })
                );
            }

            res.status(200).send({
                providers: templates
            });
        } catch (err) {
            next(err);
        }
    }

    getProvider(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const providerKey = req.params['provider'] as string;

            res.status(200).send({
                provider: getProvider(providerKey)
            });
        } catch (err) {
            next(err);
        }
    }
}

export default new ProviderController();
