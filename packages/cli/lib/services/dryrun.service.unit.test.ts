import { describe, expect, it } from 'vitest';

import type { DryRunResult, DryRunServiceConfig } from './dryrun.service.js';

describe('DryRunService types', () => {
    describe('DryRunServiceConfig', () => {
        it('should accept minimal required config', () => {
            const config: DryRunServiceConfig = {
                fullPath: '/path/to/project',
                validation: true,
                isZeroYaml: false
            };

            expect(config).toBeDefined();
            expect(config.fullPath).toBe('/path/to/project');
            expect(config.validation).toBe(true);
            expect(config.isZeroYaml).toBe(false);
        });

        it('should accept config with optional environment', () => {
            const config: DryRunServiceConfig = {
                fullPath: '/path/to/project',
                validation: false,
                isZeroYaml: true,
                environment: 'dev'
            };

            expect(config.environment).toBe('dev');
        });

        it('should accept config with optional returnOutput', () => {
            const config: DryRunServiceConfig = {
                fullPath: '/path/to/project',
                validation: true,
                isZeroYaml: false,
                returnOutput: true
            };

            expect(config.returnOutput).toBe(true);
        });
    });

    describe('DryRunResult discriminated union', () => {
        it('should accept success result with output', () => {
            const result: DryRunResult = {
                success: true,
                output: 'Test output'
            };

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.output).toBe('Test output');
            }
        });

        it('should accept failure result with error', () => {
            const result: DryRunResult = {
                success: false,
                error: 'Test error'
            };

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBe('Test error');
            }
        });

        it('should accept failure result with errorDetails', () => {
            const result: DryRunResult = {
                success: false,
                error: 'Test error',
                errorDetails: 'Additional details'
            };

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBe('Test error');
                expect(result.errorDetails).toBe('Additional details');
            }
        });

        it('should accept failure result with validationError', () => {
            const result: DryRunResult = {
                success: false,
                error: 'Validation failed',
                validationError: {
                    type: 'invalid_action_output',
                    code: 'invalid_action_output',
                    payload: { data: {}, validation: [] }
                }
            };

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.validationError).toBeDefined();
                if (result.validationError && 'code' in result.validationError) {
                    expect(result.validationError.code).toBe('invalid_action_output');
                }
            }
        });

        it('should properly discriminate success from failure', () => {
            const successResult: DryRunResult = {
                success: true,
                output: 'Success'
            };

            const failureResult: DryRunResult = {
                success: false,
                error: 'Failed'
            };

            // Type narrowing should work correctly
            if (successResult.success) {
                // TypeScript should know this is the success branch
                const _output: string = successResult.output;
                expect(_output).toBe('Success');
            }

            if (!failureResult.success) {
                // TypeScript should know this is the failure branch
                const _error: string = failureResult.error;
                expect(_error).toBe('Failed');
            }
        });
    });
});
