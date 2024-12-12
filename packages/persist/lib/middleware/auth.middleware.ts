import type { Request, Response, NextFunction } from 'express';
import { environmentService } from '@nangohq/shared';
import { stringifyError } from '@nangohq/utils';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authorizationHeader = req.get('authorization');

    if (!authorizationHeader) {
        res.status(401).json({ error: 'Missing authorization header' });
        return;
    }

    const secret = authorizationHeader.split('Bearer ').pop();
    if (!secret) {
        res.status(401).json({ error: 'Malformed authorization header. Expected `Bearer SECRET_KEY`' });
        return;
    }

    const environmentId = parseInt(req.params['environmentId'] || '');
    if (!environmentId) {
        res.status(401).json({ error: 'Missing environmentId' });
        return;
    }

    environmentService
        .getAccountAndEnvironmentBySecretKey(secret)
        .then((result) => {
            if (!result || result.environment.id !== environmentId) {
                throw new Error('Cannot find matching environment');
            }
            next();
        })
        .catch((err: unknown) => {
            res.status(401).json({ error: `Unauthorized: ${stringifyError(err)}` });
        });
};
