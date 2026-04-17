import { getApiUrl } from '@nangohq/shared';
import { cloudHost, isCloud, isStaging, stagingHost } from '@nangohq/utils';

import { envs } from '../../env.js';

export const remoteFunctionProjectPath = '/home/user/nango-integrations';
export const remoteFunctionCompilerTemplate = envs.E2B_SANDBOX_COMPILER_TEMPLATE;
export const remoteFunctionLocalImage = 'agent-sandboxes/blank-workspace:local';

export const remoteFunctionCompileTimeoutMs = 3 * 60 * 1000;
export const remoteFunctionDeployTimeoutMs = 5 * 60 * 1000;
export const remoteFunctionDryrunTimeoutMs = 5 * 60 * 1000;

const remoteFunctionSandboxTimeoutBufferMs = 30 * 1000;

export const remoteFunctionCompilerSandboxTimeoutMs = remoteFunctionCompileTimeoutMs + remoteFunctionSandboxTimeoutBufferMs;
export const remoteFunctionDeploySandboxTimeoutMs = remoteFunctionDeployTimeoutMs + remoteFunctionSandboxTimeoutBufferMs;
export const remoteFunctionDryrunSandboxTimeoutMs = remoteFunctionCompileTimeoutMs + remoteFunctionDryrunTimeoutMs + remoteFunctionSandboxTimeoutBufferMs;

export function getRemoteFunctionNangoHost(): string {
    if (isCloud) {
        return isStaging ? stagingHost : cloudHost;
    }
    if (process.env['NANGO_SERVER_URL']) {
        return process.env['NANGO_SERVER_URL'];
    }

    return getApiUrl();
}
