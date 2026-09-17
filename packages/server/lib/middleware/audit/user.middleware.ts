import { makeAuditTarget as makeTarget } from '../../audit.js';
import { Audit, auditable } from './auditable.js';
import { nonEmptyString, omitUndefined } from './input.js';

import type { PatchUser } from '@nangohq/types';

export const auditUserUpdated = auditable<PatchUser>({
    policy: Audit.auditable({ resource: 'user', action: 'updated', scope: 'account' }),
    target: (_req, locals) => makeTarget('user', locals.user?.id, locals.user?.email),
    metadata: (req) =>
        omitUndefined({
            name: nonEmptyString(req.body.name),
            gettingStartedClosed: typeof req.body.gettingStartedClosed === 'boolean' ? req.body.gettingStartedClosed : undefined
        })
});
