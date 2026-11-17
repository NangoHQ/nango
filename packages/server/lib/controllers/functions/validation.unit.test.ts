import { describe, expect, it } from 'vitest';

import { functionDeploymentBodySchema, functionDryrunBodySchema } from './validation.js';

const codeDeploy = { type: 'function', integration_id: 'github', function_name: 'getIssue', code: 'code' };
const dryrun = { integration_id: 'github', code: 'code', connection_id: 'conn-1' };
const templateDeploy = { type: 'template', integration_id: 'github', template: 'getIssue' };

describe('function_type validation', () => {
    it.each(['action', 'sync', 'tool', 'function'])('accepts %s on code deploys and dry runs', (function_type) => {
        expect(functionDeploymentBodySchema.safeParse({ ...codeDeploy, function_type }).success).toBe(true);
        expect(functionDryrunBodySchema.safeParse({ ...dryrun, function_type }).success).toBe(true);
    });

    it.each([undefined, 'on-event'])('rejects %s on code deploys and dry runs', (function_type) => {
        expect(functionDeploymentBodySchema.safeParse({ ...codeDeploy, function_type }).success).toBe(false);
        expect(functionDryrunBodySchema.safeParse({ ...dryrun, function_type }).success).toBe(false);
    });

    it.each(['action', 'sync', 'tool', 'function', undefined])('accepts %s on template deploys', (function_type) => {
        expect(functionDeploymentBodySchema.safeParse({ ...templateDeploy, function_type }).success).toBe(true);
    });

    it.each(['tool', 'function'])('accepts version and allow_destructive for %s', (function_type) => {
        expect(functionDeploymentBodySchema.safeParse({ ...codeDeploy, function_type, version: '1.0.0', allow_destructive: true }).success).toBe(true);
    });
});
