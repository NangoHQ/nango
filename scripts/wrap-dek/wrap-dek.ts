/**
 * Wrap (default) or unwrap (--decrypt) the Nango global DEK with a KMS master key, using the AWS Encryption SDK.
 *
 * Supports AWS KMS (--key-arn), GCP Cloud KMS (--gcp-key-name) or Azure Key Vault (--azure-key-id). Pass exactly one.
 *
 * The DEK is read from stdin so it never lands on disk or in shell history.
 *
 * AWS wrap:    echo -n "$NANGO_ENCRYPTION_KEY" | npx tsx wrap-dek.ts --key-arn <kms-key-arn> --context purpose=global_dek --context app=nango > dek-wrapped.b64
 * GCP wrap:    echo -n "$NANGO_ENCRYPTION_KEY" | npx tsx wrap-dek.ts --gcp-key-name <resource> --context purpose=global_dek --context app=nango > dek-wrapped.b64
 * Azure wrap:  echo -n "$NANGO_ENCRYPTION_KEY" | npx tsx wrap-dek.ts --azure-key-id <key-id> --context purpose=global_dek --context app=nango > dek-wrapped.b64
 * AWS verify:  cat dek-wrapped.b64 | npx tsx wrap-dek.ts --decrypt --key-arn <kms-key-arn> --context purpose=global_dek --context app=nango | base64 -d
 * GCP verify:  cat dek-wrapped.b64 | npx tsx wrap-dek.ts --decrypt --gcp-key-name <resource> --context purpose=global_dek --context app=nango | base64 -d
 * Azure verify: cat dek-wrapped.b64 | npx tsx wrap-dek.ts --decrypt --azure-key-id <key-id> --context purpose=global_dek --context app=nango | base64 -d
 *               (output must match $NANGO_ENCRYPTION_KEY byte-for-byte)
 *
 * --gcp-key-name is a Cloud KMS crypto key resource:
 *   projects/PROJECT/locations/LOCATION/keyRings/RING/cryptoKeys/KEY
 * GCP calls use Application Default Credentials. Set GOOGLE_IMPERSONATE_SERVICE_ACCOUNT
 * to impersonate that SA (ADC principal needs roles/iam.serviceAccountTokenCreator;
 * the SA needs roles/cloudkms.cryptoKeyEncrypterDecrypter on the key).
 *
 *   export GOOGLE_IMPERSONATE_SERVICE_ACCOUNT=nango-terraform@PROJECT.iam.gserviceaccount.com
 *
 * --azure-key-id is a versioned Key Vault RSA key identifier:
 *   https://VAULT.vault.azure.net/keys/NAME/VERSION
 * Azure calls use DefaultAzureCredential (e.g. `az login`); the principal needs
 * Key Vault Crypto User on the key.
 *
 * --context is optional and repeatable; pairs are bound to the envelope on wrap and
 * verified against the envelope header on --decrypt.
 *
 */
import { parseArgs } from 'node:util';

import { buildClient, CommitmentPolicy, KmsKeyringNode } from '@aws-crypto/client-node';

import type { KeyringNode } from '@aws-crypto/client-node';

const USAGE =
    'Usage: echo -n "$DEK_B64" | tsx wrap-dek.ts (--key-arn <kms-key-arn> | --gcp-key-name <resource> | --azure-key-id <key-id>) [--decrypt] [--context key=value ...]';

const { values } = parseArgs({
    options: {
        'key-arn': { type: 'string' },
        'gcp-key-name': { type: 'string' },
        'azure-key-id': { type: 'string' },
        decrypt: { type: 'boolean', default: false },
        // Repeatable key=value pairs, e.g. --context purpose=dek --context app=nango.
        // Bound to the envelope on wrap; verified against the envelope header on --decrypt.
        context: { type: 'string', multiple: true }
    }
});

const keyArn = values['key-arn'];
const gcpKeyName = values['gcp-key-name'];
const azureKeyId = values['azure-key-id'];
if ([keyArn, gcpKeyName, azureKeyId].filter(Boolean).length > 1) {
    console.error('--key-arn, --gcp-key-name and --azure-key-id are mutually exclusive: pass only one');
    console.error(USAGE);
    process.exit(1);
}

const keyring = await resolveKeyring(keyArn, gcpKeyName, azureKeyId, values.decrypt);
const wrappingKey = gcpKeyName ?? azureKeyId ?? keyArn;

const encryptionContext: Record<string, string> = {};
for (const pair of values.context ?? []) {
    const [key, ...rest] = pair.split('=');
    const value = rest.join('=');
    if (!key || !value) {
        console.error(`Invalid --context entry "${pair}", expected key=value`);
        process.exit(1);
    }
    encryptionContext[key] = value;
}

const input = await readStdin();
if (!input) {
    console.error('No input on stdin. Pipe the base64 DEK (wrap) or the base64 envelope (--decrypt).');
    process.exit(1);
}

const { encrypt, decrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_REQUIRE_DECRYPT);

if (values.decrypt) {
    const { plaintext, messageHeader } = await decrypt(keyring, Buffer.from(input, 'base64'));
    for (const [key, value] of Object.entries(encryptionContext)) {
        if (messageHeader.encryptionContext[key] !== value) {
            throw new Error(`Encryption context mismatch: expected ${key}=${value}, got ${String(messageHeader.encryptionContext[key])}`);
        }
    }
    console.error(`Unwrapped with ${messageHeader.encryptedDataKeys[0]?.providerInfo ?? 'unknown key'}`);
    writeOut(plaintext.toString('base64'));
} else {
    const dek = Buffer.from(input, 'base64');
    if (dek.byteLength !== 32) {
        throw new Error(`DEK must be the base64 of exactly 32 bytes, got ${dek.byteLength} bytes`);
    }
    const { result } = await encrypt(keyring, dek, { encryptionContext });
    console.error(`Wrapped ${dek.byteLength}-byte DEK with ${wrappingKey} (${result.byteLength}-byte envelope)`);
    writeOut(result.toString('base64'));
}

async function resolveKeyring(
    keyArn: string | undefined,
    gcpKeyName: string | undefined,
    azureKeyId: string | undefined,
    decrypt: boolean | undefined
): Promise<KeyringNode> {
    if (gcpKeyName) {
        // Copied from packages/kms/lib/gcp.ts (`npm run sync-gcp`) so it uses this install's KeyringNode.
        const { GcpKmsKeyringNode } = await import('./gcp.js');
        const { defaultGcpKmsClient } = await import('./gcp-client.js');
        return new GcpKmsKeyringNode(gcpKeyName, defaultGcpKmsClient());
    }
    if (azureKeyId) {
        // Copied from packages/kms/lib/azure.ts (`npm run sync-azure`) so it uses this install's KeyringNode.
        const { AzureKmsKeyringNode } = await import('./azure.js');
        return new AzureKmsKeyringNode(azureKeyId);
    }
    if (!keyArn) {
        console.error('Missing wrapping key. Pass --key-arn <arn>, --gcp-key-name <resource> or --azure-key-id <key-id>');
        console.error(USAGE);
        process.exit(1);
    }
    return decrypt ? new KmsKeyringNode({ keyIds: [keyArn] }) : new KmsKeyringNode({ generatorKeyId: keyArn });
}

// Trailing newline on a TTY so the shell prompt doesn't overwrite the output;
// raw bytes when piped/redirected so `$(...)` and `> file` captures stay exact.
function writeOut(value: string): void {
    process.stdout.write(process.stdout.isTTY ? `${value}\n` : value);
}

async function readStdin(): Promise<string> {
    let data = '';
    for await (const chunk of process.stdin) {
        data += chunk;
    }
    return data.trim();
}
