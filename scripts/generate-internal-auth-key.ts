import { generateKeyPairSync } from 'node:crypto';

const KID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SERVICES = ['jobs', 'server'] as const;

type Service = (typeof SERVICES)[number];

/**
 * Print an Ed25519 key pair for internal service auth.
 *
 * Run from the repo root:
 *   npm run internal-auth:key -- jobs
 *   npm run internal-auth:key -- server --kid server-2026-10
 *
 * stdout is three env assignments. The private key is an unencrypted PKCS8 PEM.
 * The public key is the base64url raw 32-byte Ed25519 key. Jobs and server need
 * different kid values.
 */
function main(): void {
    const { service, kid } = parseArgs(process.argv.slice(2));
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString().trim();
    const raw = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
        .subarray(12)
        .toString('base64url');
    const prefix = service === 'jobs' ? 'NANGO_INTERNAL_AUTH_JOBS' : 'NANGO_INTERNAL_AUTH_SERVER';
    const publicKeys = JSON.stringify([{ kid, publicKey: raw }]);

    console.log(`${prefix}_KEY_ID=${kid}`);
    console.log(`${prefix}_PRIVATE_KEY=${JSON.stringify(pem)}`);
    console.log(`${prefix}_PUBLIC_KEYS=${JSON.stringify(publicKeys)}`);
}

function parseArgs(argv: string[]): { service: Service; kid: string } {
    const [service, ...rest] = argv;
    if (!isService(service)) {
        usage();
        process.exit(1);
    }

    let kid: string | undefined;
    for (let i = 0; i < rest.length; i++) {
        const arg = rest[i];
        if (arg === '--kid') {
            const value = rest[i + 1];
            if (value === undefined || value.startsWith('-')) {
                console.error('--kid requires a key id');
                usage();
                process.exit(1);
            }
            kid = value;
            i++;
            continue;
        }
        usage();
        process.exit(1);
    }

    const id = kid ?? defaultKid(service);
    if (!KID.test(id)) {
        console.error(`kid must match ${KID}`);
        process.exit(1);
    }
    return { service, kid: id };
}

function isService(value: string | undefined): value is Service {
    return SERVICES.some((service) => service === value);
}

function defaultKid(service: Service): string {
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${service}-${now.getUTCFullYear()}-${month}`;
}

function usage(): void {
    console.error(`Usage: npm run internal-auth:key -- <jobs|server> [--kid <id>]

Prints KEY_ID, PRIVATE_KEY, and PUBLIC_KEYS for that service.
The private key stays on the minting process. Put PUBLIC_KEYS on the verifiers first.`);
}

main();
