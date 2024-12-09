import type { Result } from '@nangohq/utils';
import { Err, Ok } from '@nangohq/utils';
import type { CommitHash } from '@nangohq/types';
import crypto from 'crypto';

export function generateCommitHash(): Result<CommitHash> {
    const charset = '0123456789abcdef';
    const length = 40;
    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);

    const value = Array.from(randomBytes)
        .map((byte) => charset[byte % charset.length])
        .join('');
    if (value.length !== 40) {
        return Err('CommitHash must be exactly 40 characters');
    }
    return Ok(value as CommitHash);
}
