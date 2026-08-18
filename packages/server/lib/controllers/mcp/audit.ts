import { getFlags } from '@nangohq/feature-flags';
import { getLogger } from '@nangohq/utils';

import { audit } from '../../audit.js';

import type { AuditEvent } from '@nangohq/audit';
import type { AuditAttribution, AuditOutcome, AuditPolicy, AuditTarget, DBEnvironment, DBTeam } from '@nangohq/types';

const logger = getLogger('Server.ManagementMcpAudit');

export function recordManagementMcpAudit({
    account,
    environment,
    auditContext,
    policy,
    outcome,
    target,
    metadata
}: {
    account: DBTeam;
    environment: DBEnvironment;
    auditContext: AuditAttribution;
    policy: AuditPolicy;
    outcome: AuditOutcome;
    target?: AuditTarget | AuditTarget[] | undefined;
    metadata?: Record<string, unknown> | undefined;
}): void {
    const event = {
        occurredAt: new Date().toISOString(),
        accountId: account.id,
        environment: policy.scope === 'account' ? null : { id: environment.id, display: environment.name },
        actor: auditContext.actor,
        resource: policy.resource,
        action: policy.action,
        targets: Array.isArray(target) ? target : target ? [target] : [],
        context: { ...auditContext.context, interface: 'mcp' },
        outcome,
        ...(metadata ? { metadata } : {})
    } as AuditEvent;

    void emit(account.uuid, event);
}

async function emit(accountUuid: string, event: AuditEvent): Promise<void> {
    try {
        if (!(await getFlags().isAuditTrailEnabled(accountUuid))) {
            return;
        }

        const result = await audit.record(event);
        if (result.isErr()) {
            logger.error('Failed to record Management MCP audit event', result.error);
        }
    } catch (err) {
        logger.error('Failed to emit Management MCP audit event', err);
    }
}
