import { describe, expect, expectTypeOf, it } from 'vitest';

import { validation } from './validation.js';

import type { FunctionDeploymentBundleBody } from '@nangohq/types';
import type * as z from 'zod';

type DeployBody = FunctionDeploymentBundleBody;

const validFunction = {
    name: 'consumeWebhook',
    integrationId: 'github',
    description: 'Consume and persist an incoming webhook',
    trigger: {
        kind: 'http',
        subscriptions: ['issues'],
        debounce: {
            keyBy: [{ body: '$.repository.id' }, { header: 'x-github-delivery' }],
            windowMs: 1000,
            maxEntities: 100,
            take: 'latest'
        }
    },
    requires: { connection: true, outbound: true, invoke: true },
    capabilities: {
        usesRecords: true,
        usesOutbound: true,
        usesCheckpoints: true,
        usesMetadata: true,
        usesInvoke: true
    },
    limits: { concurrency: { perConnection: 'max' } },
    input_schema_ref: '#/definitions/FunctionInput_github_consumeWebhook',
    output_schema_ref: '#/definitions/FunctionOutput_github_consumeWebhook',
    model_schema_refs: ['#/definitions/GithubIssue'],
    metadata_schema_ref: '#/definitions/FunctionMetadata_github_consumeWebhook',
    checkpoint_schema_ref: '#/definitions/FunctionCheckpoint_github_consumeWebhook',
    json_schema: {
        definitions: {
            FunctionInput_github_consumeWebhook: { type: 'object' },
            FunctionOutput_github_consumeWebhook: { type: 'object' },
            GithubIssue: { type: 'object' },
            FunctionMetadata_github_consumeWebhook: { type: 'object' },
            FunctionCheckpoint_github_consumeWebhook: { type: 'object' }
        }
    },
    fileBody: {
        js: 'module.exports = async () => ({})',
        ts: 'export default async () => ({})'
    }
} satisfies DeployBody['functions'][number];

const validBody = {
    reconciliationScope: { kind: 'environment' },
    functions: [validFunction]
} satisfies DeployBody;

describe('function deploy validation', () => {
    it('stays structurally aligned with the endpoint body', () => {
        expectTypeOf<z.input<typeof validation>>().toEqualTypeOf<DeployBody>();
        expectTypeOf<z.output<typeof validation>>().toEqualTypeOf<DeployBody>();
    });

    it('rejects inconsistent capabilities', () => {
        const result = validation.safeParse({
            ...validBody,
            functions: [
                {
                    ...validFunction,
                    capabilities: { ...validFunction.capabilities, usesRecords: false }
                }
            ]
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual(
                expect.objectContaining({
                    path: ['functions', 0, 'capabilities', 'usesRecords']
                })
            );
        }
    });

    it('rejects schema references that are not defined', () => {
        const result = validation.safeParse({
            ...validBody,
            functions: [{ ...validFunction, output_schema_ref: '#/definitions/MissingOutput' }]
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual(
                expect.objectContaining({
                    path: ['functions', 0, 'json_schema', 'definitions']
                })
            );
        }
    });

    it('accepts an event trigger with multiple distinct events and no input schema', () => {
        const result = validation.safeParse({
            ...validBody,
            functions: [{ ...validFunction, trigger: { kind: 'event', events: ['post-connection-creation', 'validate-connection'] }, input_schema_ref: null }]
        });
        expect(result.success).toBe(true);
    });

    it.each([
        { reason: 'empty', events: [] },
        { reason: 'duplicate', events: ['post-connection-creation', 'post-connection-creation'] },
        { reason: 'unknown', events: ['unknown'] }
    ])('rejects invalid event lists: $reason', ({ events }) => {
        const result = validation.safeParse({
            ...validBody,
            functions: [{ ...validFunction, trigger: { kind: 'event', events }, input_schema_ref: null }]
        });
        expect(result.success).toBe(false);
    });

    it.each([
        { kind: 'schedule', trigger: { kind: 'schedule', frequency: 'every hour' } },
        { kind: 'event', trigger: { kind: 'event', events: ['validate-connection'] } }
    ])('rejects input on a $kind trigger', ({ kind, trigger }) => {
        const result = validation.safeParse({ ...validBody, functions: [{ ...validFunction, trigger }] });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual(
                expect.objectContaining({ path: ['functions', 0, 'input_schema_ref'], message: `${kind} must not declare input` })
            );
        }
    });

    it('rejects duplicate names within an integration', () => {
        const result = validation.safeParse({ ...validBody, functions: [validFunction, validFunction] });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual(
                expect.objectContaining({
                    path: ['functions']
                })
            );
        }
    });

    it('accepts multiple functions for the same integration in an integration-scoped deployment', () => {
        const result = validation.safeParse({
            reconciliationScope: { kind: 'integration', integrationId: 'github' },
            functions: [validFunction, { ...validFunction, name: 'consumePullRequestWebhook' }]
        });

        expect(result.success).toBe(true);
    });

    it('accepts an empty integration-scoped deployment with an explicit integration key', () => {
        const result = validation.safeParse({
            reconciliationScope: { kind: 'integration', integrationId: 'github' },
            functions: []
        });

        expect(result.success).toBe(true);
    });

    it('accepts multiple integration keys for an environment-scoped deployment', () => {
        const result = validation.safeParse({
            reconciliationScope: { kind: 'environment' },
            functions: [validFunction, { ...validFunction, name: 'consumeGitlabWebhook', integrationId: 'gitlab' }]
        });

        expect(result.success).toBe(true);
    });

    it('rejects functions outside the integration reconciliation scope', () => {
        const result = validation.safeParse({
            reconciliationScope: { kind: 'integration', integrationId: 'github' },
            functions: [validFunction, { ...validFunction, name: 'consumeGitlabWebhook', integrationId: 'gitlab' }]
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual(
                expect.objectContaining({
                    message: 'Functions must match the integration reconciliation scope',
                    path: ['functions']
                })
            );
        }
    });
});
