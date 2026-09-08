import { makeAuditTarget as makeTarget } from '../../audit.js';
import { Audit, auditable } from './auditable.js';
import { nonEmptyString, omitUndefined } from './input.js';

import type { PutTeam } from '@nangohq/types';

export const auditTeamUpdated = auditable<PutTeam>({
    policy: Audit.auditable({ resource: 'team', action: 'updated', scope: 'account' }),
    target: (_req, locals) => makeTarget('team', locals.account?.id, locals.account?.name),
    metadata: (req) => omitUndefined({ name: nonEmptyString(req.body.name) })
});
