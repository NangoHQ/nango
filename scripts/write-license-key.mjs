import { createHash, createPublicKey } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const declaration = 'export const licensePublicKey: string | null';
const [file] = process.argv.slice(2);
const pem = process.env['NANGO_LICENSE_PUBLIC_KEY']?.trim();

if (!file || !pem) {
    console.error('Usage: NANGO_LICENSE_PUBLIC_KEY=<pem> node write-license-key.mjs <key.ts>');
    process.exit(1);
}

const source = readFileSync(file, 'utf8');
const nullDeclaration = `${declaration} = null;`;
if (source.split(nullDeclaration).length !== 2) {
    console.error(`${file} must contain \`${nullDeclaration}\` exactly once`);
    process.exit(1);
}

if (!pem.startsWith('-----BEGIN PUBLIC KEY-----')) {
    console.error('NANGO_LICENSE_PUBLIC_KEY must be a PEM-encoded public key');
    process.exit(1);
}

const key = createPublicKey(pem);
if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    console.error('NANGO_LICENSE_PUBLIC_KEY must be an EC P-256 public key');
    process.exit(1);
}

const fingerprint = createHash('sha256')
    .update(key.export({ type: 'spki', format: 'der' }))
    .digest('hex')
    .slice(0, 16);

const publicPem = key.export({ type: 'spki', format: 'pem' });

writeFileSync(file, source.replace(nullDeclaration, `${declaration} = ${JSON.stringify(publicPem)};`));
console.log(`License public key written (${fingerprint})`);
