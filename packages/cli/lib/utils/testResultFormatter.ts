import chalk from 'chalk';

import { displayValidationError } from './errors.js';

import type { InvalidActionInputSDKError, InvalidActionOutputSDKError, InvalidRecordSDKError } from '@nangohq/runner-sdk';

export interface TestResult {
    success: boolean;
    output?: string;
    error?: string;
    errorDetails?: string;
    validationError?: InvalidActionInputSDKError | InvalidActionOutputSDKError | InvalidRecordSDKError | { type: string; code?: string; payload: unknown };
    details?: Record<string, unknown>;
}

export interface TestContext {
    scriptName: string;
    connectionId: string;
    environment: string;
    mode: 'Local' | 'Remote';
}

const DISPLAY_WIDTH = 60;

export function displayTestResult(result: TestResult, context: TestContext): void {
    printHeader(result.success, context.mode);
    printTestDetails(context);

    if (result.success) {
        printSuccess(result, context);
    } else {
        printFailure(result);
    }

    printFooter();
}

function printHeader(success: boolean, mode: string): void {
    console.log('');
    console.log(chalk.gray('═'.repeat(DISPLAY_WIDTH)));
    if (success) {
        console.log(chalk.green.bold(`  ✓ ${mode.toUpperCase()} TEST PASSED`));
    } else {
        console.log(chalk.red.bold(`  ✗ ${mode.toUpperCase()} TEST FAILED`));
    }
    console.log(chalk.gray('═'.repeat(DISPLAY_WIDTH)));
}

function printTestDetails(context: TestContext): void {
    console.log('');
    console.log(chalk.cyan.bold('Test Details:'));
    console.log(chalk.gray('  Script:        '), chalk.white(context.scriptName));
    console.log(chalk.gray('  Connection ID: '), chalk.white(context.connectionId));
    console.log(chalk.gray('  Environment:   '), chalk.white(context.environment));
    console.log(chalk.gray('  Mode:          '), chalk.white(context.mode));
}

function printSuccess(result: TestResult, context: TestContext): void {
    // For remote tests, don't show verbose output - just pass/fail is enough
    if (context.mode === 'Remote') {
        return;
    }

    // For local tests, show the output
    console.log('');
    console.log(chalk.gray('─'.repeat(DISPLAY_WIDTH)));
    console.log(chalk.green.bold(result.output?.includes('Output') ? 'Output:' : 'Result:'));

    if (result.output) {
        console.log('  ', result.output);
    }

    if (result.details) {
        console.log('');
        console.log(chalk.gray('Details:'));
        console.log(JSON.stringify(result.details, null, 2));
    }
}

function printFailure(result: TestResult): void {
    console.log('');
    console.log(chalk.gray('─'.repeat(DISPLAY_WIDTH)));
    console.log(chalk.red.bold('Failure Reason:'));
    console.log('');

    // Display validation errors nicely
    if (result.validationError) {
        const err = result.validationError;
        if ('code' in err && (err.code === 'invalid_action_output' || err.code === 'invalid_action_input')) {
            const errorType = err.code === 'invalid_action_input' ? 'Input' : 'Output';
            console.log(chalk.yellow(`  ${errorType} validation failed`));
            console.log('');

            if ('payload' in err && err.payload) {
                displayValidationError(err.payload as Parameters<typeof displayValidationError>[0]);
            }
            return;
        }
        if ('type' in err && err.type === 'invalid_sync_record') {
            console.log(chalk.yellow('  Record validation failed'));
            console.log('');

            if ('payload' in err && err.payload) {
                displayValidationError(err.payload as Parameters<typeof displayValidationError>[0]);
            }
            return;
        }
    }

    // Display regular error
    console.log(chalk.red('  ', result.error));

    if (result.details) {
        console.log('');
        console.log(chalk.gray('Details:'));
        console.log(JSON.stringify(result.details, null, 2));
    } else if (result.errorDetails) {
        console.log('');
        console.log(chalk.gray('Details:'));
        console.log(result.errorDetails);
    }
}

function printFooter(): void {
    console.log('');
    console.log(chalk.gray('═'.repeat(DISPLAY_WIDTH)));
    console.log('');
}
