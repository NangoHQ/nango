import { makeAuditTarget } from '../../audit.js';
import { Audit, auditable } from './auditable.js';

import type { PostOAuthApprove, PostOAuthDeny } from '@nangohq/types';

export const auditOAuthApproved = auditable<PostOAuthApprove>({
    policy: Audit.auditable({ resource: 'oauth_grant', action: 'approved', scope: 'account' }),
    targetFromResponse: (response) => makeAuditTarget('oauth_grant', response.data.grantId)
});
export const auditOAuthDenied = auditable<PostOAuthDeny>({
    policy: Audit.auditable({ resource: 'oauth_grant', action: 'denied', scope: 'account' })
});
