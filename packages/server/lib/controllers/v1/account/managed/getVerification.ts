import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { GetManagedEmailVerification } from '@nangohq/types';

export const getManagedEmailVerification = asyncWrapper<GetManagedEmailVerification>((req, res) => {
    const verification = req.session.managedAuthEmailVerification;

    if (!verification) {
        res.status(404).send({
            error: { code: 'not_found', message: 'No pending WorkOS email verification was found. Please try signing in with Google again.' }
        });
        return;
    }

    res.send({
        data: {
            email: verification.email
        }
    });
});
