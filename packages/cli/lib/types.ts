import type { CLIError } from './utils/errors';

export interface GlobalOptions {
    autoConfirm: boolean;
    debug: boolean;
}

export type ENV = 'local' | 'cloud';

export interface DeployOptions extends GlobalOptions {
    env?: ENV;
    local?: boolean;
    version?: string;
    sync?: string;
    action?: string;
    allowDestructive?: boolean;
}

export interface InternalDeployOptions {
    env?: ENV;
}

export type CLIServiceResponse<T = any> =
    | {
          error: CLIError | null;
      }
    | {
          value: T | null;
      };
