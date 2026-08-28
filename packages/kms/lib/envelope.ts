import { buildClient, CommitmentPolicy, KmsKeyringNode } from '@aws-crypto/client-node';

import { GcpKmsKeyringNode } from './gcp_kms_keyring.js';

import type { EncryptionContext, KeyringNode } from '@aws-crypto/client-node';

const DEK_BYTE_LENGTH = 32;

// Strictest commitment policy: refuses to decrypt without key commitment, preventing downgrade attacks.
const { decrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_REQUIRE_DECRYPT);

export type UnwrapDekOptions = {
    wrapped: string; // base64 AWS Encryption SDK envelope
    expectedContext: EncryptionContext; // the exact encryption context the envelope must have been wrapped with
} & (
    | { kmsKeyArn: string; gcpKmsKeyName?: never; keyring?: never }
    | { gcpKmsKeyName: string; kmsKeyArn?: never; keyring?: never }
    | { keyring: KeyringNode; kmsKeyArn?: never; gcpKmsKeyName?: never }
);

/**
 * Unwrap a wrapped DEK envelope and return the key as base64.
 * Fails fast on a tampered envelope, mismatched encryption context, or wrong key length.
 */
export async function unwrapDek(opts: UnwrapDekOptions): Promise<string> {
    const keyring = resolveKeyring(opts);
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

function resolveKeyring(opts: UnwrapDekOptions): KeyringNode {
    // Exclusive-union members are still assignable at runtime if a caller passes both
    // identifiers (excess-property checks only apply to object literals). Count defined
    // wrapping sources so we never silently prefer GCP over AWS.
    const kmsKeyArn = 'kmsKeyArn' in opts ? opts.kmsKeyArn : undefined;
    const gcpKmsKeyName = 'gcpKmsKeyName' in opts ? opts.gcpKmsKeyName : undefined;
    const injectable = 'keyring' in opts ? opts.keyring : undefined;
    const defined = [kmsKeyArn, gcpKmsKeyName, injectable].filter((value) => value !== undefined);
    if (defined.length !== 1) {
        throw new Error('unwrapDek requires exactly one of kmsKeyArn, gcpKmsKeyName, or keyring');
    }
    if (injectable) {
        return injectable;
    }
    if (gcpKmsKeyName) {
        return new GcpKmsKeyringNode(gcpKmsKeyName);
    }
    if (!kmsKeyArn) {
        throw new Error('unwrapDek requires exactly one of kmsKeyArn, gcpKmsKeyName, or keyring');
    }
    return new KmsKeyringNode({ keyIds: [kmsKeyArn] });
}

function assertEncryptionContext(context: Readonly<Record<string, string>>, expected: EncryptionContext): void {
    for (const [key, value] of Object.entries(expected)) {
        if (context[key] !== value) {
            throw new Error(`Encryption context mismatch on "${key}": the wrapped key was not produced for this purpose`);
        }
    }
}
