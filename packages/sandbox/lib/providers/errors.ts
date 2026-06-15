export class SandboxCommandExitError extends Error {
    public readonly stdout: string | undefined;
    public readonly stderr: string | undefined;
    public readonly exitCode: number;

    constructor(message: string, params: { stdout?: string | undefined; stderr?: string | undefined; exitCode?: number | undefined; cause?: unknown } = {}) {
        super(message, { cause: params.cause });
        this.name = 'SandboxCommandExitError';
        this.stdout = params.stdout;
        this.stderr = params.stderr;
        this.exitCode = params.exitCode ?? 1;
    }
}

export class SandboxCommandTimeoutError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'SandboxCommandTimeoutError';
    }
}

export class SandboxUnavailableError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'SandboxUnavailableError';
    }
}

export class SandboxNotImplementedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SandboxNotImplementedError';
    }
}
