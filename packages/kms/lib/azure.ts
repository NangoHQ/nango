import crypto from 'node:crypto';

import { EncryptedDataKey, immutableClass, KeyringNode, KeyringTraceFlag, readOnlyProperty, unwrapDataKey } from '@aws-crypto/client-node';
import { DefaultAzureCredential } from '@azure/identity';
import { CryptographyClient, parseKeyVaultKeyIdentifier } from '@azure/keyvault-keys';

import type { KeyringTrace, NodeDecryptionMaterial, NodeEncryptionMaterial } from '@aws-crypto/client-node';

export const AZURE_KMS_PROVIDER_ID = 'azure-key-vault';

// Key Vault (non-HSM) only offers RSA wrapping, which has no AAD: the encryption context
// is still bound by the envelope header, but Key Vault itself does not see it.
const WRAP_ALGORITHM = 'RSA-OAEP-256';

export type AzureKmsClient = {
    wrapKey(algorithm: typeof WRAP_ALGORITHM, key: Uint8Array): Promise<{ result: Uint8Array }>;
    unwrapKey(algorithm: typeof WRAP_ALGORITHM, encryptedKey: Uint8Array): Promise<{ result: Uint8Array }>;
};

/**
 * Encryption SDK keyring (the envelope library, no AWS calls) backed by Azure Key Vault wrapKey/unwrapKey.
 * Key Vault has no GenerateDataKey; on encrypt we generate the data key locally then wrap it.
 */
export class AzureKmsKeyringNode extends KeyringNode {
    declare public readonly keyId: string;
    declare readonly client: AzureKmsClient;

    constructor(keyId: string, client?: AzureKmsClient) {
        super();
        // A versionless id wraps with the latest version, so a key rotation would make the DEK unreadable.
        if (!parseKeyVaultKeyIdentifier(keyId).version) {
            throw new Error(`Azure Key Vault key id must include a version: ${keyId}`);
        }
        readOnlyProperty(this, 'keyId', keyId);
        readOnlyProperty(this, 'client', client ?? new CryptographyClient(keyId, new DefaultAzureCredential()));
    }

    override async _onEncrypt(material: NodeEncryptionMaterial): Promise<NodeEncryptionMaterial> {
        if (!material.hasUnencryptedDataKey) {
            material.setUnencryptedDataKey(new Uint8Array(crypto.randomBytes(material.suite.keyLengthBytes)), {
                keyNamespace: AZURE_KMS_PROVIDER_ID,
                keyName: this.keyId,
                flags: KeyringTraceFlag.WRAPPING_KEY_GENERATED_DATA_KEY
            });
        }

        const { result } = await this.client.wrapKey(WRAP_ALGORITHM, unwrapDataKey(material.getUnencryptedDataKey()));

        material.addEncryptedDataKey(
            new EncryptedDataKey({
                providerId: AZURE_KMS_PROVIDER_ID,
                providerInfo: this.keyId,
                encryptedDataKey: asBytes(result, 'wrapped key')
            }),
            KeyringTraceFlag.WRAPPING_KEY_ENCRYPTED_DATA_KEY
        );
        return material;
    }

    override async _onDecrypt(material: NodeDecryptionMaterial, encryptedDataKeys: EncryptedDataKey[]): Promise<NodeDecryptionMaterial> {
        // Key Vault identifiers are case-insensitive.
        const keyId = this.keyId.toLowerCase();
        const edk = encryptedDataKeys.find((candidate) => candidate.providerId === AZURE_KMS_PROVIDER_ID && candidate.providerInfo.toLowerCase() === keyId);
        if (!edk) {
            return material;
        }

        const { result } = await this.client.unwrapKey(WRAP_ALGORITHM, edk.encryptedDataKey);

        const trace: KeyringTrace = {
            keyNamespace: AZURE_KMS_PROVIDER_ID,
            keyName: this.keyId,
            flags: KeyringTraceFlag.WRAPPING_KEY_DECRYPTED_DATA_KEY
        };
        material.setUnencryptedDataKey(asBytes(result, 'unwrapped key'), trace);
        return material;
    }
}
immutableClass(AzureKmsKeyringNode);

function asBytes(value: Uint8Array, label: string): Uint8Array {
    if (value.length === 0) {
        throw new Error(`Azure Key Vault did not return a ${label}`);
    }
    // The Encryption SDK requires an isolated ArrayBuffer (byteOffset 0). Node may return pooled Buffers.
    return new Uint8Array(value);
}
