import { getLogger } from '@nangohq/utils';

import { auditEventDropped, recordAuditEvent } from '../../audit.js';
import { canRecordAuditTrail } from '../../utils/auditTrail.js';

import type { AuditEvent } from '@nangohq/audit';
import type { AuditAttribution, AuditOutcome, AuditPolicy, AuditTarget, DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';

const logger = getLogger('Server.ManagementMcpAudit');

export function recordManagementMcpAudit({
    account,
    environment,
    plan,
    auditContext,
    policy,
    outcome,
    target,
    metadata
}: {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    auditContext: AuditAttribution;
    policy: AuditPolicy;
    outcome: AuditOutcome;
    target?: AuditTarget | AuditTarget[] | undefined;
    // Already checked against the tool's declared action, so this only carries it to the event.
    metadata?: object | undefined;
}): void {
    const event = {
        occurredAt: new Date().toISOString(),
        accountId: account.id,
        scope: policy.scope,
        environment: policy.scope === 'account' ? null : { id: environment.uuid, display: environment.name },
        actor: auditContext.actor,
        resource: policy.resource,
        action: policy.action,
        targets: Array.isArray(target) ? target : target ? [target] : [],
        context: { ...auditContext.context, interface: 'mcp' },
        outcome,
        ...(metadata ? { metadata } : {})
    } as AuditEvent;

    void emit(account.uuid, plan, event);
}

async function emit(accountUuid: string, plan: DBPlan | null, event: AuditEvent): Promise<void> {
    try {
        if (!(await canRecordAuditTrail(accountUuid, plan))) {
            return;
        }

        await recordAuditEvent(event);
    } catch (err) {
        logger.error('Failed to emit Management MCP audit event', err);
        auditEventDropped(event.resource, 'build_failed');
    }
}
