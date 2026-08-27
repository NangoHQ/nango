import { makeAuditTarget as makeTarget } from '../../audit.js';
import { Audit, auditable } from './auditable.js';

import type { PutTeam } from '@nangohq/types';

export const auditTeamUpdated = auditable<PutTeam>({
    policy: Audit.auditable({ resource: 'team', action: 'updated', scope: 'account' }),
    target: (_req, locals) => makeTarget('team', locals.account?.id, locals.account?.name),
    metadata: (req) => {
        const name = req.body.name;
        return typeof name === 'string' ? { name } : undefined;
    }
});
