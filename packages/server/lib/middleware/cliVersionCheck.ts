import type { Request, Response, NextFunction } from 'express';

import semver from 'semver';

const VERSION_REGEX = /nango-cli\/([0-9.]+)/;
export function cliVersionCheck(minVersion: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        const userAgent = req.headers['user-agent'];
        if (!userAgent) {
            // Could be strictly enforced
            next();
            return;
        }

        const match = userAgent.match(VERSION_REGEX);
        if (!match || match.length <= 1 || !match[1]) {
            // Could be strictly enforced
            next();
            return;
        }

        if (semver.gt(minVersion, match[1])) {
            res.status(400).send({
                error: { code: 'invalid_cli_version', message: `This endpoint requires a CLI version >= ${minVersion} (current: ${match[0]})` }
            });
            return;
        }

        next();
    };
}
