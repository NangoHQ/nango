import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CircuitBreaker } from './circuitBreaker.js';

const mockHealthCheckResult = vi.fn();

describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker;
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        if (circuitBreaker) {
            circuitBreaker.destroy();
        }
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('failure detection', () => {
        beforeEach(() => {
            circuitBreaker = new CircuitBreaker({
                healthCheckIntervalMs: 1000,
                failureThreshold: 2,
                recoveryThreshold: 2,
                healthCheck: mockHealthCheckResult
            });
        });

        it('should open circuit after failure threshold is reached', async () => {
            mockHealthCheckResult.mockResolvedValue(false);
            await vi.advanceTimersByTimeAsync(1000);
            expect(circuitBreaker.isUnhealthy()).toBe(false);
            await vi.advanceTimersByTimeAsync(1000);
            expect(circuitBreaker.isUnhealthy()).toBe(true);
        });

        it('should reset failure counter on successful health check', async () => {
            // One failure
            mockHealthCheckResult.mockResolvedValue(false);
            await vi.advanceTimersByTimeAsync(1000);
            expect(circuitBreaker.isUnhealthy()).toBe(false);

            // Success should reset counter
            mockHealthCheckResult.mockResolvedValue(true);
            await vi.advanceTimersByTimeAsync(1000);
            expect(circuitBreaker.isUnhealthy()).toBe(false);

            // Another failure should not open yet (counter was reset)
            mockHealthCheckResult.mockResolvedValue(false);
            await vi.advanceTimersByTimeAsync(1000);
            expect(circuitBreaker.isUnhealthy()).toBe(false);

            // Second failure after reset should open
            await vi.advanceTimersByTimeAsync(1000);
            expect(circuitBreaker.isUnhealthy()).toBe(true);
        });

        it('should treat health check rejection as unhealthy', async () => {
            circuitBreaker = new CircuitBreaker({
                healthCheckIntervalMs: 1000,
                failureThreshold: 1,
                recoveryThreshold: 1,
                healthCheck: () => Promise.reject(new Error('Health check failed'))
            });

            await vi.advanceTimersByTimeAsync(1000);
            expect(circuitBreaker.isUnhealthy()).toBe(true);
        });
    });

    describe('recovery', () => {
        beforeEach(async () => {
            // Open the circuit by failing health checks
            mockHealthCheckResult.mockResolvedValue(false);
            circuitBreaker = new CircuitBreaker({
                healthCheckIntervalMs: 1000,
                failureThreshold: 2,
                recoveryThreshold: 2,
                healthCheck: mockHealthCheckResult
            });
            await vi.advanceTimersByTimeAsync(2000);
            expect(circuitBreaker.isUnhealthy()).toBe(true);
        });

        it('should close circuit after recovery threshold is reached', async () => {
            mockHealthCheckResult.mockResolvedValue(true);
            await vi.advanceTimersByTimeAsync(2000);
            expect(circuitBreaker.isUnhealthy()).toBe(false);
        });

        it('should reset recovery counter on failed health check', async () => {
            // One success
            mockHealthCheckResult.mockResolvedValue(true);
            await vi.advanceTimersByTimeAsync(1000);
            expect(circuitBreaker.isUnhealthy()).toBe(true);

            // Failure should reset counter
            mockHealthCheckResult.mockResolvedValue(false);
            await vi.advanceTimersByTimeAsync(1000);
            expect(circuitBreaker.isUnhealthy()).toBe(true);

            // Another success should not close yet (counter was reset)
            mockHealthCheckResult.mockResolvedValue(true);
            await vi.advanceTimersByTimeAsync(1000);
            expect(circuitBreaker.isUnhealthy()).toBe(true);

            // Second success after reset should close
            await vi.advanceTimersByTimeAsync(1000);
            expect(circuitBreaker.isUnhealthy()).toBe(false);
        });
    });
});
