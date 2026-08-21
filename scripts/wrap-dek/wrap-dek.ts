/**
 * Wrap (default) or unwrap (--decrypt) the Nango global DEK with an AWS KMS master key, using the AWS Encryption SDK
 *
 * The DEK is read from stdin so it never lands on disk or in shell history.
 *
 * Wrap:   echo -n "$NANGO_ENCRYPTION_KEY" | npx tsx wrap-dek.ts --key-arn <kms-key-arn> --context purpose=global_dek --context app=nango > dek-wrapped.b64
 * Verify: cat dek-wrapped.b64 | npm run unwrap -- --key-arn <kms-key-arn> --context key1=value1 --context key2=value2 ... | base64 -d
 *          (output must match $NANGO_ENCRYPTION_KEY byte-for-byte)
 *
 * --context is optional and repeatable; pairs are bound to the envelope on wrap and
 * verified against the envelope header on --decrypt.
 *
 */
import { parseArgs } from 'node:util';

import { buildClient, CommitmentPolicy, KmsKeyringNode } from '@aws-crypto/client-node';

const { values } = parseArgs({
    options: {
        'key-arn': { type: 'string' },
        decrypt: { type: 'boolean', default: false },
        // Repeatable key=value pairs, e.g. --context purpose=dek --context app=nango.
        // Bound to the envelope on wrap; verified against the envelope header on --decrypt.
        context: { type: 'string', multiple: true }
    }
});

const keyArn = values['key-arn'];
if (!keyArn) {
    console.error('Missing KMS key ARN. Pass --key-arn <arn>');
    console.error('Usage: echo -n "$DEK_B64" | tsx wrap-dek.ts --key-arn <kms-key-arn> [--decrypt] [--context key=value ...]');
    process.exit(1);
}

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
    const { plaintext, messageHeader } = await decrypt(new KmsKeyringNode({ keyIds: [keyArn] }), Buffer.from(input, 'base64'));
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
    const { result } = await encrypt(new KmsKeyringNode({ generatorKeyId: keyArn }), dek, { encryptionContext });
    console.error(`Wrapped ${dek.byteLength}-byte DEK with ${keyArn} (${result.byteLength}-byte envelope)`);
    writeOut(result.toString('base64'));
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
