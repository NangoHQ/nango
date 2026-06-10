import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    class FunctionError extends Error {
        public readonly code: string;
        public readonly payload: unknown;

        constructor({ code, message, payload }: { code: string; message: string; payload?: unknown }) {
            super(message);
            this.code = code;
            this.payload = payload;
        }
    }

    return {
        cleanupFunctionSandbox: vi.fn(),
        FunctionError,
        getFunctionDeploymentRow: vi.fn(),
        getFunctionDryrunRow: vi.fn(),
        markFunctionDeploymentFailed: vi.fn(),
        markFunctionDeploymentSuccess: vi.fn(),
        markFunctionDryrunFailed: vi.fn(),
        markFunctionDryrunSuccess: vi.fn(),
        parseDeploySuccessOutput: vi.fn(),
        parseDryrunSuccessOutput: vi.fn()
    };
});

vi.mock('@nangohq/sandbox', () => ({
    cleanupFunctionSandbox: mocks.cleanupFunctionSandbox,
    FunctionError: mocks.FunctionError,
    getFunctionDeploymentRow: mocks.getFunctionDeploymentRow,
    getFunctionDryrunRow: mocks.getFunctionDryrunRow,
    markFunctionDeploymentFailed: mocks.markFunctionDeploymentFailed,
    markFunctionDeploymentSuccess: mocks.markFunctionDeploymentSuccess,
    markFunctionDryrunFailed: mocks.markFunctionDryrunFailed,
    markFunctionDryrunSuccess: mocks.markFunctionDryrunSuccess,
    parseDeploySuccessOutput: mocks.parseDeploySuccessOutput,
    parseDryrunSuccessOutput: mocks.parseDryrunSuccessOutput,
    remoteFunctionDeploySandboxTimeoutMs: 330_000,
    remoteFunctionDryrunSandboxTimeoutMs: 630_000,
    sandboxApiKeyService: {
        createSandboxApiKey: vi.fn()
    }
}));

import { postFunctionDeploymentResult } from './deploy/postDeployResult.js';
import { postFunctionDryrunResult } from './dryrun/postDryrunResult.js';

import type { NextFunction, Request, Response } from 'express';

describe('function result callbacks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.markFunctionDeploymentFailed.mockResolvedValue({});
        mocks.markFunctionDeploymentSuccess.mockResolvedValue({});
        mocks.markFunctionDryrunFailed.mockResolvedValue({});
        mocks.markFunctionDryrunSuccess.mockResolvedValue({});
        mocks.cleanupFunctionSandbox.mockResolvedValue(undefined);
    });

    it('marks deployments as failed when success result processing fails', async () => {
        const deploymentId = '7b539769-6d39-4442-89fc-33fbac96ea66';
        mocks.getFunctionDeploymentRow.mockResolvedValue({ id: deploymentId, status: 'running', sandbox_id: 'deployment-sandbox' });
        mocks.parseDeploySuccessOutput.mockImplementation(() => {
            throw new Error('Failed to parse deploy output');
        });

        const { req, res, next, status, send } = createRequestContext({
            id: deploymentId,
            body: { status: 'success', output: 'Successfully deployed the functions:\n- syncIssues@1.0.0', duration_ms: 123 },
            locals: {
                sandboxTokenPurpose: 'deploy',
                sandboxTokenDeploymentId: deploymentId,
                environment: { id: 10 }
            }
        });

        await postFunctionDeploymentResult(req, res, next as NextFunction);

        expect(next).not.toHaveBeenCalled();
        expect(mocks.markFunctionDeploymentSuccess).not.toHaveBeenCalled();
        expect(mocks.markFunctionDeploymentFailed).toHaveBeenCalledWith({
            environmentId: 10,
            id: deploymentId,
            output: 'Successfully deployed the functions:\n- syncIssues@1.0.0',
            durationMs: 123,
            error: expect.objectContaining({
                code: 'deployment_error',
                message: expect.stringContaining('Failed to parse deploy output')
            })
        });
        expect(mocks.cleanupFunctionSandbox).toHaveBeenCalledWith({ sandboxId: 'deployment-sandbox' });
        expect(status).toHaveBeenCalledWith(200);
        expect(send).toHaveBeenCalledWith({ ok: true });
    });

    it('marks dryruns as failed when success result processing fails', async () => {
        const dryrunId = '7b539769-6d39-4442-89fc-33fbac96ea66';
        mocks.getFunctionDryrunRow.mockResolvedValue({ id: dryrunId, status: 'running', sandbox_id: 'dryrun-sandbox' });
        mocks.parseDryrunSuccessOutput.mockReturnValue({ output: 'Executing -> function\nDone', result: { ok: true }, hasResult: true });
        mocks.markFunctionDryrunSuccess.mockRejectedValue(new Error('Failed to save dryrun result'));

        const { req, res, next, status, send } = createRequestContext({
            id: dryrunId,
            body: { status: 'success', output: 'Building\nExecuting -> function\nDone\n{"ok":true}', duration_ms: 456 },
            locals: {
                sandboxTokenPurpose: 'dryrun',
                sandboxTokenDryrunId: dryrunId,
                environment: { id: 20 }
            }
        });

        await postFunctionDryrunResult(req, res, next as NextFunction);

        expect(next).not.toHaveBeenCalled();
        expect(mocks.markFunctionDryrunFailed).toHaveBeenCalledWith({
            environmentId: 20,
            id: dryrunId,
            output: 'Building\nExecuting -> function\nDone\n{"ok":true}',
            durationMs: 456,
            error: expect.objectContaining({
                code: 'dryrun_error',
                message: expect.stringContaining('Failed to save dryrun result')
            })
        });
        expect(mocks.cleanupFunctionSandbox).toHaveBeenCalledWith({ sandboxId: 'dryrun-sandbox' });
        expect(status).toHaveBeenCalledWith(200);
        expect(send).toHaveBeenCalledWith({ ok: true });
    });
});

function createRequestContext({ id, body, locals }: { id: string; body: unknown; locals: Record<string, unknown> }): {
    req: Request;
    res: Response;
    next: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
} {
    const req = {
        params: { id },
        query: {},
        body,
        route: { path: '/functions/:kind/:id/result' },
        originalUrl: `/functions/${id}/result`,
        header: vi.fn()
    } as unknown as Request;
    const status = vi.fn().mockReturnThis();
    const send = vi.fn().mockReturnThis();
    const res = {
        locals,
        status,
        send
    } as unknown as Response;
    const next = vi.fn();

    return { req, res, next, status, send };
}
