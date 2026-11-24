import { getLogger } from '@nangohq/utils';

import { auditEventDropped, makeAuditTarget as makeTarget, recordAuditEvent } from '../audit.js';
import { canRecordAuditTrailForAccount } from '../utils/auditTrail.js';

import type { AuditAttribution, AuditEvent } from '@nangohq/audit';

const logger = getLogger('Audit');

// For integrations created outside POST /integrations, which records its own event through auditIntegrationCreated.
export async function recordIntegrationCreated(params: {
    integrationId: string;
    displayName: string | undefined;
    provider: string;
    account: { id: number; uuid: string };
    environment: { uuid: string; name: string };
    auditAttribution: AuditAttribution;
}): Promise<void> {
    try {
        if (!(await canRecordAuditTrailForAccount(params.account))) {
            return;
        }
        const target = makeTarget('integration', params.integrationId, params.displayName);
        const event: AuditEvent = {
            occurredAt: new Date().toISOString(),
            accountId: params.account.id,
            scope: 'environment',
            environment: { id: params.environment.uuid, display: params.environment.name },
            actor: params.auditAttribution.actor,
            resource: 'integration',
            action: 'created',
            targets: target ? [target] : [],
            context: params.auditAttribution.context,
            outcome: 'success',
            metadata: { provider: params.provider }
        };
        await recordAuditEvent(event);
    } catch (err) {
        logger.error(`failed to emit integration.created audit event`, err);
        auditEventDropped('integration', 'build_failed');
    }
}
