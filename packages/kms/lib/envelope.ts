import { buildClient, CommitmentPolicy, KmsKeyringNode } from '@aws-crypto/client-node';

import { AzureKmsKeyringNode } from './azure.js';
import { GcpKmsKeyringNode } from './gcp.js';

import type { EncryptionContext, KeyringNode } from '@aws-crypto/client-node';

const DEK_BYTE_LENGTH = 32;

// Strictest commitment policy: refuses to decrypt without key commitment, preventing downgrade attacks.
const { decrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_REQUIRE_DECRYPT);

export type UnwrapDekOptions = {
    wrapped: string; // base64 AWS Encryption SDK envelope
    expectedContext: EncryptionContext; // the exact encryption context the envelope must have been wrapped with
} & (
    | { kmsKeyArn: string; gcpKmsKeyName?: never; azureKmsKeyId?: never; keyring?: never }
    | { gcpKmsKeyName: string; kmsKeyArn?: never; azureKmsKeyId?: never; keyring?: never }
    | { azureKmsKeyId: string; kmsKeyArn?: never; gcpKmsKeyName?: never; keyring?: never }
    | { keyring: KeyringNode; kmsKeyArn?: never; gcpKmsKeyName?: never; azureKmsKeyId?: never }
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

export type WrappingKey = { kmsKeyArn: string } | { gcpKmsKeyName: string } | { azureKmsKeyId: string };

type WrappingKeyCandidates = {
    kmsKeyArn?: string | undefined;
    gcpKmsKeyName?: string | undefined;
    azureKmsKeyId?: string | undefined;
};

/**
 * Exactly one wrapping-key identifier. Used by unwrapDek and DekRegistry.
 * Exclusive-union types are still assignable at runtime if a caller passes several
 * (excess-property checks only apply to object literals).
 */
export function resolveWrappingKey(
    { kmsKeyArn, gcpKmsKeyName, azureKmsKeyId }: WrappingKeyCandidates,
    errors: { multiple: string; none: string }
): WrappingKey {
    if ([kmsKeyArn, gcpKmsKeyName, azureKmsKeyId].filter(Boolean).length > 1) {
        throw new Error(errors.multiple);
    }
    if (kmsKeyArn) {
        return { kmsKeyArn };
    }
    if (gcpKmsKeyName) {
        return { gcpKmsKeyName };
    }
    if (azureKmsKeyId) {
        return { azureKmsKeyId };
    }
    throw new Error(errors.none);
}

const UNWRAP_ONE_SOURCE = 'unwrapDek requires exactly one of kmsKeyArn, gcpKmsKeyName, azureKmsKeyId, or keyring';

function resolveKeyring(opts: UnwrapDekOptions): KeyringNode {
    const candidates: WrappingKeyCandidates = {
        kmsKeyArn: 'kmsKeyArn' in opts ? opts.kmsKeyArn : undefined,
        gcpKmsKeyName: 'gcpKmsKeyName' in opts ? opts.gcpKmsKeyName : undefined,
        azureKmsKeyId: 'azureKmsKeyId' in opts ? opts.azureKmsKeyId : undefined
    };
    const injectable = 'keyring' in opts ? opts.keyring : undefined;
    if (injectable) {
        if (Object.values(candidates).some((value) => value !== undefined)) {
            throw new Error(UNWRAP_ONE_SOURCE);
        }
        return injectable;
    }
    const wrappingKey = resolveWrappingKey(candidates, { multiple: UNWRAP_ONE_SOURCE, none: UNWRAP_ONE_SOURCE });
    if ('gcpKmsKeyName' in wrappingKey) {
        return new GcpKmsKeyringNode(wrappingKey.gcpKmsKeyName);
    }
    if ('azureKmsKeyId' in wrappingKey) {
        return new AzureKmsKeyringNode(wrappingKey.azureKmsKeyId);
    }
    return new KmsKeyringNode({ keyIds: [wrappingKey.kmsKeyArn] });
}

function assertEncryptionContext(context: Readonly<Record<string, string>>, expected: EncryptionContext): void {
    for (const [key, value] of Object.entries(expected)) {
        if (context[key] !== value) {
            throw new Error(`Encryption context mismatch on "${key}": the wrapped key was not produced for this purpose`);
        }
    }
}
