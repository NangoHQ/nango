import db from '@nangohq/database';
import type { ExecutionEvent, IntegrationHealthMetric } from '@nangohq/types';

class HealthService {
    async recordExecutionEvent(event: Omit<ExecutionEvent, 'id' | 'created_at'>) {
        await db.knex.from<ExecutionEvent>('execution_events').insert(event);
    }

    async getIntegrationHealthMetrics(environmentId: number): Promise<IntegrationHealthMetric[]> {
        return db.knex.from<IntegrationHealthMetric>('integration_health_metrics').where({ environment_id: environmentId });
    }

    async getExecutionTimeline(
        environmentId: number,
        integrationId: string,
        limit = 50,
        offset = 0
    ): Promise<ExecutionEvent[]> {
        const MAX_LIMIT = 200;
        const MAX_OFFSET = 10000;

        const safeLimit = Math.min(Math.max(1, Number(limit) || 50), MAX_LIMIT);
        const safeOffset = Math.max(0, Number(offset) || 0);

        // Prevent extremely large offsets that could cause heavy DB load
        // Return empty array to signal end of results (standard pagination pattern)
        if (safeOffset > MAX_OFFSET) {
            return [];
        }

        return db.knex
            .from<ExecutionEvent>('execution_events')
            .where({
                environment_id: environmentId,
                integration_id: integrationId
            })
            .orderBy('created_at', 'desc')
            .limit(safeLimit)
            .offset(safeOffset);
    }
}

export const healthService = new HealthService();