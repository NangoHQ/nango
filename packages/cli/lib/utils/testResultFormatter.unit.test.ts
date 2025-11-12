import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { displayTestResult } from './testResultFormatter.js';

import type { TestContext, TestResult } from './testResultFormatter.js';

describe('testResultFormatter', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
    });

    const context: TestContext = {
        scriptName: 'test-script',
        connectionId: 'conn-123',
        environment: 'dev',
        mode: 'Local'
    };

    describe('displayTestResult', () => {
        it('should display success result with output for local tests', () => {
            const result: TestResult = {
                success: true,
                output: 'Test passed successfully'
            };

            displayTestResult(result, context);

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✓'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('LOCAL TEST PASSED'));
            expect(consoleLogSpy).toHaveBeenCalledWith('  ', 'Test passed successfully');
        });

        it('should not display verbose output for remote test success', () => {
            const result: TestResult = {
                success: true,
                output: 'Test passed successfully'
            };

            const remoteContext: TestContext = {
                ...context,
                mode: 'Remote'
            };

            displayTestResult(result, remoteContext);

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✓'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('REMOTE TEST PASSED'));
            // Should NOT show the verbose output
            expect(consoleLogSpy).not.toHaveBeenCalledWith('  ', 'Test passed successfully');
        });

        it('should display success result with details', () => {
            const result: TestResult = {
                success: true,
                output: 'Test passed',
                details: { foo: 'bar' }
            };

            displayTestResult(result, context);

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Details:'));
            expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify({ foo: 'bar' }, null, 2));
        });

        it('should display failure result with error', () => {
            const result: TestResult = {
                success: false,
                error: 'Test failed'
            };

            displayTestResult(result, context);

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✗'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('LOCAL TEST FAILED'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Failure Reason:'));
        });

        it('should display validation error for invalid action input', () => {
            const result: TestResult = {
                success: false,
                error: 'Validation failed',
                validationError: {
                    type: 'invalid_action_input',
                    code: 'invalid_action_input',
                    payload: {
                        data: { foo: 'bar' },
                        validation: [],
                        model: 'TestModel'
                    }
                }
            };

            displayTestResult(result, context);

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Input validation failed'));
        });

        it('should display validation error for invalid action output', () => {
            const result: TestResult = {
                success: false,
                error: 'Validation failed',
                validationError: {
                    type: 'invalid_action_output',
                    code: 'invalid_action_output',
                    payload: {
                        data: { foo: 'bar' },
                        validation: [],
                        model: 'TestModel'
                    }
                }
            };

            displayTestResult(result, context);

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Output validation failed'));
        });

        it('should display validation error for invalid sync record', () => {
            const result: TestResult = {
                success: false,
                error: 'Validation failed',
                validationError: {
                    type: 'invalid_sync_record',
                    payload: {
                        data: { foo: 'bar' },
                        validation: [],
                        model: 'TestModel'
                    }
                }
            };

            displayTestResult(result, context);

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Record validation failed'));
        });

        it('should display error details when provided', () => {
            const result: TestResult = {
                success: false,
                error: 'Test failed',
                errorDetails: 'Additional error information'
            };

            displayTestResult(result, context);

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Details:'));
            expect(consoleLogSpy).toHaveBeenCalledWith('Additional error information');
        });

        it('should display test details correctly', () => {
            const result: TestResult = {
                success: true,
                output: 'Test passed'
            };

            displayTestResult(result, context);

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test Details:'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('test-script'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('conn-123'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('dev'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Local'));
        });

        it('should handle remote mode correctly', () => {
            const result: TestResult = {
                success: true,
                output: 'Test passed'
            };

            const remoteContext: TestContext = {
                ...context,
                mode: 'Remote'
            };

            displayTestResult(result, remoteContext);

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('REMOTE TEST PASSED'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Remote'));
        });
    });
});
