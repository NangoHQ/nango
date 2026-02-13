import type { FleetError } from '../utils/errors.js';
import type { Result } from '@nangohq/utils';

export interface ImageVerifier {
    verify(image: string): Promise<Result<boolean, FleetError>>;
}
