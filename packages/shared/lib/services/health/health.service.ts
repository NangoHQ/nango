import db from '@nangohq/database';

import type { ExecutionEvent, IntegrationHealthMetric } from '@nangohq/types';

class HealthService {
    async recordExecutionEvent(event: Omit<ExecutionEvent, 'id' | 'created_at'>) {
        await db.knex.from<ExecutionEvent>('execution_events').insert(event);
    }

    async getIntegrationHealthMetrics(environmentId: number): Promise<IntegrationHealthMetric[]> {
        return db.knex.from<IntegrationHealthMetric>('integration_health_metrics').where({ environment_id: environmentId });
    }

    async getExecutionTimeline(environmentId: number, integrationId: string, limit = 50, offset = 0): Promise<ExecutionEvent[]> {
        return db.knex
            .from<ExecutionEvent>('execution_events')
            .where({ environment_id: environmentId, integration_id: integrationId })
            .orderBy('created_at', 'desc')
            .limit(limit)
            .offset(offset);
    }
}

export const healthService = new HealthService();
