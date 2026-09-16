import crypto from 'node:crypto';

import { EncryptedDataKey, immutableClass, KeyringNode, KeyringTraceFlag, readOnlyProperty, unwrapDataKey } from '@aws-crypto/client-node';
import { KeyManagementServiceClient } from '@google-cloud/kms';

import type { KeyringTrace, NodeDecryptionMaterial, NodeEncryptionMaterial } from '@aws-crypto/client-node';

export const GCP_KMS_PROVIDER_ID = 'gcp-kms';

export type GcpKmsClient = {
    encrypt(request: {
        name: string;
        plaintext: Uint8Array;
        additionalAuthenticatedData: Uint8Array;
    }): Promise<[{ ciphertext?: Uint8Array | string | null | undefined }, ...unknown[]]>;
    decrypt(request: {
        name: string;
        ciphertext: Uint8Array;
        additionalAuthenticatedData: Uint8Array;
    }): Promise<[{ plaintext?: Uint8Array | string | null | undefined }, ...unknown[]]>;
};

/**
 * Wraps and unwraps an AWS Encryption SDK data key via GCP Cloud KMS Encrypt/Decrypt.
 * GCP has no GenerateDataKey; on encrypt we generate the data key locally then wrap it.
 */
export class GcpKmsKeyringNode extends KeyringNode {
    declare public readonly keyName: string;
    declare readonly client: GcpKmsClient;

    constructor(keyName: string, client: GcpKmsClient = new KeyManagementServiceClient()) {
        super();
        readOnlyProperty(this, 'keyName', keyName);
        readOnlyProperty(this, 'client', client);
    }

    override async _onEncrypt(material: NodeEncryptionMaterial): Promise<NodeEncryptionMaterial> {
        if (!material.hasUnencryptedDataKey) {
            material.setUnencryptedDataKey(new Uint8Array(crypto.randomBytes(material.suite.keyLengthBytes)), {
                keyNamespace: GCP_KMS_PROVIDER_ID,
                keyName: this.keyName,
                flags: KeyringTraceFlag.WRAPPING_KEY_GENERATED_DATA_KEY
            });
        }

        const plaintext = unwrapDataKey(material.getUnencryptedDataKey());
        const [{ ciphertext }] = await this.client.encrypt({
            name: this.keyName,
            plaintext,
            additionalAuthenticatedData: serializeAad(material.encryptionContext)
        });

        material.addEncryptedDataKey(
            new EncryptedDataKey({
                providerId: GCP_KMS_PROVIDER_ID,
                providerInfo: this.keyName,
                encryptedDataKey: asBytes(ciphertext, 'ciphertext')
            }),
            KeyringTraceFlag.WRAPPING_KEY_ENCRYPTED_DATA_KEY | KeyringTraceFlag.WRAPPING_KEY_SIGNED_ENC_CTX
        );
        return material;
    }

    override async _onDecrypt(material: NodeDecryptionMaterial, encryptedDataKeys: EncryptedDataKey[]): Promise<NodeDecryptionMaterial> {
        const edk = encryptedDataKeys.find((candidate) => candidate.providerId === GCP_KMS_PROVIDER_ID && candidate.providerInfo === this.keyName);
        if (!edk) {
            return material;
        }

        const [{ plaintext }] = await this.client.decrypt({
            name: this.keyName,
            ciphertext: edk.encryptedDataKey,
            additionalAuthenticatedData: serializeAad(material.encryptionContext)
        });

        const trace: KeyringTrace = {
            keyNamespace: GCP_KMS_PROVIDER_ID,
            keyName: this.keyName,
            flags: KeyringTraceFlag.WRAPPING_KEY_DECRYPTED_DATA_KEY | KeyringTraceFlag.WRAPPING_KEY_VERIFIED_ENC_CTX
        };
        material.setUnencryptedDataKey(asBytes(plaintext, 'plaintext'), trace);
        return material;
    }
}
immutableClass(GcpKmsKeyringNode);

function asBytes(value: Uint8Array | string | null | undefined, label: string): Uint8Array {
    if (value == null || value.length === 0) {
        throw new Error(`GCP KMS did not return a ${label}`);
    }
    // The Encryption SDK requires an isolated ArrayBuffer (byteOffset 0). GCP/Node may return pooled Buffers.
    return new Uint8Array(typeof value === 'string' ? Buffer.from(value, 'base64') : value);
}

/**
 * Bound into every GCP-wrapped DEK as Cloud KMS additionalAuthenticatedData.
 * Changing this serialization makes every previously wrapped DEK unreadable via GCP KMS.
 */
function serializeAad(context: Readonly<Record<string, string>>): Uint8Array {
    return Buffer.from(JSON.stringify(context, Object.keys(context).sort()));
}
