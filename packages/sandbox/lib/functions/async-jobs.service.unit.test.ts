import { describe, expect, it } from 'vitest';

import { toFunctionDeploymentCreate, toFunctionDeploymentResult, toFunctionDryrunCreate, toFunctionDryrunResult } from './async-jobs.service.js';

import type { DBFunctionDeployment, DBFunctionDryrun } from './async-jobs.service.js';

const now = new Date('2026-06-05T13:00:00.000Z');
const completedAt = new Date('2026-06-05T13:00:02.000Z');

describe('toFunctionDryrunCreate', () => {
    it('returns a create response for a waiting dryrun', () => {
        const row = createDryrunRow({ status: 'waiting' });

        expect(toFunctionDryrunCreate(row)).toStrictEqual({
            id: row.id,
            status: 'waiting',
            created_at: now.toISOString()
        });
    });

    it('returns a create response for a running dryrun', () => {
        const row = createDryrunRow({ status: 'running' });

        expect(toFunctionDryrunCreate(row)).toStrictEqual({
            id: row.id,
            status: 'running',
            created_at: now.toISOString()
        });
    });

    it('throws when creating a dryrun response from a completed dryrun', () => {
        const row = createDryrunRow({ status: 'failed' });

        expect(() => toFunctionDryrunCreate(row)).toThrow("Cannot create function dryrun response for 'failed' dryrun");
    });

    it('throws when creating a dryrun response from a deployment job', () => {
        const row = createDeploymentRow({ status: 'waiting' });

        expect(() => toFunctionDryrunCreate(row as unknown as DBFunctionDryrun)).toThrow("Cannot create function dryrun response for 'deployment' job");
    });
});

describe('toFunctionDeploymentCreate', () => {
    it('returns a create response for a waiting deployment', () => {
        const row = createDeploymentRow({ status: 'waiting' });

        expect(toFunctionDeploymentCreate(row)).toStrictEqual({
            id: row.id,
            status: 'waiting',
            created_at: now.toISOString()
        });
    });

    it('returns a create response for a running deployment', () => {
        const row = createDeploymentRow({ status: 'running' });

        expect(toFunctionDeploymentCreate(row)).toStrictEqual({
            id: row.id,
            status: 'running',
            created_at: now.toISOString()
        });
    });

    it('throws when creating a deployment response from a completed deployment', () => {
        const row = createDeploymentRow({ status: 'success' });

        expect(() => toFunctionDeploymentCreate(row)).toThrow("Cannot create function deployment response for 'success' deployment");
    });

    it('throws when creating a deployment response from a dryrun job', () => {
        const row = createDryrunRow({ status: 'waiting' });

        expect(() => toFunctionDeploymentCreate(row as unknown as DBFunctionDeployment)).toThrow("Cannot create function deployment response for 'dryrun' job");
    });
});

describe('toFunctionDryrunResult', () => {
    it('returns a dryrun result response with optional result fields', () => {
        const row = createDryrunRow({
            status: 'success',
            output: 'Dryrun output',
            result: { ok: true },
            has_result: true,
            duration_ms: 123,
            started_at: now,
            completed_at: completedAt
        });

        expect(toFunctionDryrunResult(row)).toStrictEqual({
            id: row.id,
            status: 'success',
            integration_id: row.request.integration_id,
            function_type: row.request.function_type,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
            started_at: now.toISOString(),
            completed_at: completedAt.toISOString(),
            duration_ms: 123,
            output: 'Dryrun output',
            result: { ok: true }
        });
    });

    it('omits dryrun result when no result was returned', () => {
        const row = createDryrunRow({ status: 'failed', has_result: false, error: { code: 'dryrun_error', message: 'Dry run failed' } });

        expect(toFunctionDryrunResult(row)).toStrictEqual({
            id: row.id,
            status: 'failed',
            integration_id: row.request.integration_id,
            function_type: row.request.function_type,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
            error: { code: 'dryrun_error', message: 'Dry run failed' }
        });
    });
});

describe('toFunctionDeploymentResult', () => {
    it('returns a deployment result response with deployed functions', () => {
        const deployedFunctions = [{ name: 'function', version: '1.0.0' }];
        const row = createDeploymentRow({
            status: 'success',
            output: 'Deployment output',
            result: { deployed: true, deployed_functions: deployedFunctions },
            has_result: true,
            duration_ms: 456,
            started_at: now,
            completed_at: completedAt
        });

        expect(toFunctionDeploymentResult(row)).toStrictEqual({
            id: row.id,
            status: 'success',
            integration_id: row.request.integration_id,
            function_name: row.request.function_name,
            function_type: row.request.function_type,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
            started_at: now.toISOString(),
            completed_at: completedAt.toISOString(),
            duration_ms: 456,
            output: 'Deployment output',
            deployed: true,
            deployed_functions: deployedFunctions
        });
    });

    it('omits deployment result fields when the stored result is invalid', () => {
        const row = createDeploymentRow({
            status: 'failed',
            result: { deployed: true, deployed_functions: [{ name: 'function' }] },
            has_result: true,
            error: { code: 'deployment_error', message: 'Deployment failed' }
        });

        expect(toFunctionDeploymentResult(row)).toStrictEqual({
            id: row.id,
            status: 'failed',
            integration_id: row.request.integration_id,
            function_name: row.request.function_name,
            function_type: row.request.function_type,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
            error: { code: 'deployment_error', message: 'Deployment failed' }
        });
    });
});

function createDryrunRow(overrides: Partial<DBFunctionDryrun> = {}): DBFunctionDryrun {
    return {
        id: '7b539769-6d39-4442-89fc-33fbac96ea66',
        environment_id: 1,
        job_type: 'dryrun',
        request: {
            integration_id: 'github',
            function_name: 'function',
            function_type: 'sync',
            code: 'export default {}',
            connection_id: 'conn'
        },
        status: 'waiting',
        sandbox_id: null,
        output: null,
        result: null,
        has_result: false,
        error: null,
        duration_ms: null,
        execution_timeout_at: null,
        started_at: null,
        completed_at: null,
        created_at: now,
        updated_at: now,
        ...overrides
    };
}

function createDeploymentRow(overrides: Partial<DBFunctionDeployment> = {}): DBFunctionDeployment {
    return {
        id: '7b539769-6d39-4442-89fc-33fbac96ea66',
        environment_id: 1,
        job_type: 'deployment',
        request: {
            type: 'function',
            integration_id: 'github',
            function_name: 'function',
            function_type: 'sync',
            code: 'export default {}'
        },
        status: 'waiting',
        sandbox_id: null,
        output: null,
        result: null,
        has_result: false,
        error: null,
        duration_ms: null,
        execution_timeout_at: null,
        started_at: null,
        completed_at: null,
        created_at: now,
        updated_at: now,
        ...overrides
    };
}
