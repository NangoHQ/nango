import { describe, expect, it } from 'vitest';

import { toFunctionDryrunCreate } from './dryruns.service.js';

import type { DBFunctionDryrun } from './dryruns.service.js';

describe('function dryruns service', () => {
    it('does not coerce completed statuses into dryrun create responses', () => {
        const row: DBFunctionDryrun = {
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
            status: 'failed',
            sandbox_id: null,
            output: null,
            result: null,
            has_result: false,
            error: { code: 'dryrun_error', message: 'Dry run failed' },
            duration_ms: null,
            execution_timeout_at: null,
            started_at: null,
            completed_at: null,
            created_at: new Date(),
            updated_at: new Date()
        };

        expect(() => toFunctionDryrunCreate(row)).toThrow("Cannot create function dryrun response for 'failed' dryrun");
    });
});
