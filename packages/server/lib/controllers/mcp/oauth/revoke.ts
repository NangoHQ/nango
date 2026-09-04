import * as z from 'zod';

import { getLogger, metrics, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { getManagementMcpOAuthConfig, isManagementMcpOAuthEnabled } from './config.js';
import { revokeManagementMcpOAuthGrants } from './grant.js';

const logger = getLogger('Audit.ManagementMcpOAuth');
const selectorSchema = z.union([
    z.object({ grantId: z.string().min(1) }).strict(),
    z.object({ userId: z.number().int().positive() }).strict(),
    z.object({ accountId: z.number().int().positive() }).strict(),
    z.object({ clientId: z.string().min(1) }).strict()
]);

export const postRevokeManagementMcpOAuthGrants = asyncWrapper(async (req, res) => {
    if (!isManagementMcpOAuthEnabled()) {
        res.status(404).json({ error: { code: 'not_found', message: 'Management MCP OAuth is disabled.' } });
        return;
    }
    const body = selectorSchema.safeParse(req.body);
    if (!body.success) {
        res.status(400).json({ error: { code: 'invalid_body', errors: zodErrorToHTTP(body.error) } });
        return;
    }

    const revoked = await revokeManagementMcpOAuthGrants(body.data, getManagementMcpOAuthConfig().storageKey);
    const selector = Object.keys(body.data)[0] ?? 'unknown';
    logger.info('Management MCP OAuth grants revoked by operator', { event: 'operator_revoke', selector, revoked });
    metrics.increment(metrics.Types.MCP_OAUTH_EVENT, 1, { event: 'operator_revoke', outcome: 'success' });
    res.status(200).json({ revoked });
});
