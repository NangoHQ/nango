import { licensePublicKey } from '@nangohq/license';
import { NANGO_VERSION, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../../env.js';
import { evaluateLicense } from '../../../license.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetInstallation } from '@nangohq/types';

export const getInstallation = asyncWrapper<GetInstallation>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    if (!licensePublicKey) {
        res.status(400).send({ error: { code: 'no_license_public_key', message: 'This build has no license public key compiled in' } });
        return;
    }

    res.status(200).send({
        data: {
            version: NANGO_VERSION,
            managedVersion: envs.NANGO_MANAGED_VERSION ?? null,
            commit: envs.GIT_HASH ?? null,
            license: await evaluateLicense(licensePublicKey)
        }
    });
});
