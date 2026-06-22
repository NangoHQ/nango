export const compileTimeoutMs = 3 * 60 * 1000;
export const deployTimeoutMs = 5 * 60 * 1000;
export const dryrunTimeoutMs = 5 * 60 * 1000;

const sandboxTimeoutBufferMs = 30 * 1000;

export const compileSandboxTimeoutMs = compileTimeoutMs + sandboxTimeoutBufferMs;
export const deploySandboxTimeoutMs = deployTimeoutMs + sandboxTimeoutBufferMs;
export const dryrunSandboxTimeoutMs = compileTimeoutMs + dryrunTimeoutMs + sandboxTimeoutBufferMs;
