import type { Node } from '../types';
import type { Result } from '@nangohq/utils';

export interface NodeProvider {
    start(node: Node): Promise<Result<void>>;
    terminate(node: Node): Promise<Result<void>>;
    verifyUrl(url: string): Promise<Result<void>>;
}
