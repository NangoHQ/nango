import { cloudHost, isCloud, isEnterprise, isStaging, stagingHost } from '@nangohq/utils';

export const remoteFunctionProjectPath = '/home/user/nango-integrations';
export const remoteFunctionCompilerTemplate = process.env['E2B_SANDBOX_COMPILER_TEMPLATE'] || 'blank-workspace:staging';
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

function getApiUrl(): string {
    if (isEnterprise && process.env['NANGO_SERVER_URL']) {
        return process.env['NANGO_SERVER_URL'];
    }
    if (process.env['SERVER_SERVICE_URL']) {
        return process.env['SERVER_SERVICE_URL'];
    }

    return `${getServerHost()}:${getServerPort()}`;
}

function getServerHost(): string {
    if (process.env['SERVER_HOST']) {
        return process.env['SERVER_HOST'];
    }
    if (process.env['SERVER_RUN_MODE'] === 'DOCKERIZED') {
        return 'http://nango-server';
    }

    return 'http://localhost';
}

function getServerPort(): number {
    if (process.env['SERVER_PORT']) {
        return +process.env['SERVER_PORT'];
    }
    if (process.env['PORT']) {
        return +process.env['PORT'];
    }
    if (process.env['NANGO_PORT']) {
        return +process.env['NANGO_PORT'];
    }

    return 3003;
}
