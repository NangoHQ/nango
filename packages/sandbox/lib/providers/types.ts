export type SandboxProviderName = 'e2b' | 'docker' | 'agentcore';

export type SandboxPurpose = 'compile' | 'deploy' | 'dryrun';

export interface CreateSandboxParams {
    purpose: SandboxPurpose;
    timeoutMs: number;
    metadata?: Record<string, string> | undefined;
}

export interface CleanupSandboxParams {
    sandboxId: string;
    apiKey?: string | undefined;
}

export interface SandboxFile {
    /**
     * Relative paths are resolved inside the provider's workspace.
     * Absolute paths are written as-is for provider-specific scratch files.
     */
    path: string;
    contents: string;
}

export interface SandboxCommandParams {
    command: string;
    /**
     * Defaults to the provider workspace. Relative paths are resolved from it.
     */
    cwd?: string | undefined;
    timeoutMs: number;
    envs?: Record<string, string> | undefined;
}

export interface SandboxCommandResult {
    stdout: string;
    stderr: string;
}

export interface Sandbox {
    readonly id: string;
    readonly provider: SandboxProviderName;
    writeFiles(files: SandboxFile[]): Promise<void>;
    readTextFile(path: string): Promise<string>;
    runCommand(params: SandboxCommandParams): Promise<SandboxCommandResult>;
    startCommand(params: SandboxCommandParams): Promise<void>;
    stop(): Promise<void>;
}

export interface SandboxProvider {
    readonly name: SandboxProviderName;
    create(params: CreateSandboxParams): Promise<Sandbox>;
    cleanup(params: CleanupSandboxParams): Promise<void>;
}
