import { auditEventDropped, recordAuditEvent } from '../../audit.js';
import { canRecordAuditTrailForAccount } from '../../utils/auditTrail.js';
import { auditRequestFields, logger, outcomeFromStatus } from './auditable.js';

import type { RevokedProductGrant } from '../../oauth/product-grant.service.js';
import type { OAuthGrantRevocationRequest } from '@nangohq/oauth-server';
import type { AuditEvent } from '@nangohq/types';
import type { Request, RequestHandler } from 'express';

function auditOAuthConsent(action: 'approved' | 'denied'): RequestHandler {
    return (req, res, next) => {
        res.on('finish', () => {
            const facts = req.audit?.oauthConsent;
            if (!facts) return;
            void (async () => {
                try {
                    if (!(await canRecordAuditTrailForAccount({ id: facts.accountId }))) return;
                    const target = facts.productGrantId
                        ? { type: 'oauth_grant' as const, id: facts.productGrantId }
                        : { type: 'oauth_client' as const, id: facts.clientHostname, display: facts.clientHostname };
                    const event: AuditEvent = {
                        occurredAt: new Date().toISOString(),
                        accountId: facts.accountId,
                        scope: 'account',
                        environment: null,
                        actor: { type: 'user', id: String(facts.userId), display: facts.userEmail },
                        resource: 'oauth_grant',
                        action,
                        targets: [target],
                        ...auditRequestFields(req, facts.accountId),
                        outcome: outcomeFromStatus(res.statusCode),
                        metadata: {
                            clientHostname: facts.clientHostname,
                            resourceHostnames: facts.resourceHostnames,
                            scopes: facts.scopes
                        }
                    };
                    await recordAuditEvent(event);
                } catch (err) {
                    logger.error('failed to emit oauth grant audit event', err);
                    auditEventDropped('oauth_grant', 'build_failed');
                }
            })();
        });
        next();
    };
}

export const auditOAuthGrantApproved = auditOAuthConsent('approved');
export const auditOAuthGrantDenied = auditOAuthConsent('denied');

export const auditOAuthGrantsRevoked: RequestHandler = (req, res, next) => {
    res.on('finish', () => {
        const facts = req.audit?.oauthGrantRevocations;
        if (!facts || outcomeFromStatus(res.statusCode) !== 'success') return;
        void recordUserGrantRevocations(facts, req);
    });
    next();
};

async function recordUserGrantRevocations(facts: NonNullable<Express.AuditFacts['oauthGrantRevocations']>, req: Request): Promise<void> {
    try {
        if (!(await canRecordAuditTrailForAccount({ id: facts.accountId }))) return;
        await Promise.all(
            facts.grants.map(async (grant) => {
                const event: AuditEvent = {
                    occurredAt: new Date().toISOString(),
                    accountId: facts.accountId,
                    scope: 'account',
                    environment: null,
                    actor: { type: 'user', id: String(facts.userId), display: facts.userEmail },
                    resource: 'oauth_grant',
                    action: 'revoked',
                    targets: [{ type: 'oauth_grant', id: grant.id }],
                    ...auditRequestFields(req, facts.accountId),
                    outcome: 'success',
                    metadata: { resourceHostnames: grant.resourceHostnames, scopes: grant.scopes }
                };
                await recordAuditEvent(event);
            })
        );
    } catch (err) {
        logger.error('failed to emit password-triggered oauth grant revocation audit event', err);
        auditEventDropped('oauth_grant', 'build_failed');
    }
}

export async function recordOAuthGrantRevocation(grant: RevokedProductGrant, request: OAuthGrantRevocationRequest): Promise<void> {
    try {
        if (!(await canRecordAuditTrailForAccount({ id: grant.accountId }))) return;
        const clientHostname = new URL(request.clientId).hostname;
        const event: AuditEvent = {
            occurredAt: new Date().toISOString(),
            accountId: grant.accountId,
            scope: 'account',
            environment: null,
            actor: { type: 'unknown', id: clientHostname, display: clientHostname },
            resource: 'oauth_grant',
            action: 'revoked',
            targets: [{ type: 'oauth_grant', id: grant.id }],
            context: {
                interface: 'api',
                ...(request.ip ? { ip: request.ip } : {}),
                ...(request.userAgent ? { userAgent: request.userAgent } : {})
            },
            outcome: 'success',
            metadata: {
                clientHostname,
                resourceHostnames: grant.resources.map(({ resource }) => new URL(resource).hostname),
                scopes: [...new Set(grant.resources.flatMap(({ scopes }) => scopes))]
            }
        };
        await recordAuditEvent(event);
    } catch (err) {
        logger.error('failed to emit oauth grant revocation audit event', err);
        auditEventDropped('oauth_grant', 'build_failed');
    }
}
