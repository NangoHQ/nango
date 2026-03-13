import { metrics } from '@nangohq/utils';

export const concurrencyMonitor = {
    start(dimensions: { type: string; accountId: number }): void {
        metrics.increment(metrics.Types.FUNCTION_EXECUTIONS_CONCURRENCY, 1, dimensions);
    },
    end(dimensions: { type: string; accountId: number }): void {
        metrics.decrement(metrics.Types.FUNCTION_EXECUTIONS_CONCURRENCY, 1, dimensions);
    }
};
