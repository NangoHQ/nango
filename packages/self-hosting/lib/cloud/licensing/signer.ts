import { createPublicKey } from 'node:crypto';

import { GetPublicKeyCommand, KMSClient, SignCommand } from '@aws-sdk/client-kms';

export interface LicenseSigner {
    publicKeyPem: string;
    sign: (data: Buffer) => Promise<Buffer>;
}

export async function kmsLicenseSigner({ keyId }: { keyId: string }): Promise<LicenseSigner> {
    const kms = new KMSClient({});
    const { PublicKey } = await kms.send(new GetPublicKeyCommand({ KeyId: keyId }));
    if (!PublicKey) {
        throw new Error(`KMS returned no public key for ${keyId}`);
    }
    return {
        publicKeyPem: createPublicKey({ key: Buffer.from(PublicKey), format: 'der', type: 'spki' })
            .export({ type: 'spki', format: 'pem' })
            .toString(),
        sign: async (data) => {
            const { Signature } = await kms.send(new SignCommand({ KeyId: keyId, Message: data, MessageType: 'RAW', SigningAlgorithm: 'ECDSA_SHA_256' }));
            if (!Signature) {
                throw new Error(`KMS returned no signature from ${keyId}`);
            }
            return Buffer.from(Signature);
        }
    };
}
