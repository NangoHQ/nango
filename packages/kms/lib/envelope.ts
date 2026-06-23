import { buildClient, CommitmentPolicy, KmsKeyringNode } from '@aws-crypto/client-node';

import type { EncryptionContext, KeyringNode } from '@aws-crypto/client-node';

const DEK_BYTE_LENGTH = 32;

// Strictest commitment policy: refuses to decrypt without key commitment, preventing downgrade attacks.
const { decrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_REQUIRE_DECRYPT);

export type UnwrapDekOptions = {
    wrapped: string; // base64 AWS Encryption SDK envelope
    expectedContext: EncryptionContext; // the exact encryption context the envelope must have been wrapped with
} & (
    | { kmsKeyArn: string } // The KMS key ARN to use for unwrapping the DEK
    | { keyring: KeyringNode } // injectable for tests (e.g. RawAesKeyringNode)
);

/**
 * Unwrap a wrapped DEK envelope and return the key as base64.
 * Fails fast on a tampered envelope, mismatched encryption context, or wrong key length.
 */
export async function unwrapDek(opts: UnwrapDekOptions): Promise<string> {
    const keyring = 'keyring' in opts ? opts.keyring : new KmsKeyringNode({ keyIds: [opts.kmsKeyArn] });
    const { plaintext: unwrapped, messageHeader } = await decrypt(keyring, Buffer.from(opts.wrapped, 'base64'));
    assertEncryptionContext(messageHeader.encryptionContext, opts.expectedContext);
    assertDekLength(unwrapped);
    return Buffer.from(unwrapped).toString('base64');
}

export function assertDekLength(dek: Uint8Array): void {
    if (dek.byteLength !== DEK_BYTE_LENGTH) {
        throw new Error(`Encryption key must be ${DEK_BYTE_LENGTH} bytes, got ${dek.byteLength}`);
    }
}

function assertEncryptionContext(context: Readonly<Record<string, string>>, expected: EncryptionContext): void {
    for (const [key, value] of Object.entries(expected)) {
        if (context[key] !== value) {
            throw new Error(`Encryption context mismatch on "${key}": the wrapped key was not produced for this purpose`);
        }
    }
}
