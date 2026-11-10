import { createCustomer } from '../services/customer.service.js';
import { createInstallationKey } from '../services/installation-key.service.js';
import { createInstallationLicense } from '../services/installation-license.service.js';
import { createInstallation } from '../services/installation.service.js';

import type { RegistryDb } from '../services/db.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function seedInstallation(
    db: RegistryDb,
    name: string,
    { licensed = true }: { licensed?: boolean } = {}
): Promise<{ uuid: string; kid: string; privateKeyPem: string }> {
    const customer = (await createCustomer(db, { name: `customer-${name}` })).unwrap();
    const installation = (await createInstallation(db, { customerId: customer.id, name, mode: 'byoc', stage: 'production' })).unwrap();
    const { key, privateKeyPem } = (await createInstallationKey(db, { installationId: installation.id })).unwrap();
    if (licensed) {
        (
            await createInstallationLicense(db, {
                installationId: installation.id,
                issuedAt: new Date(),
                expiresAt: new Date(Date.now() + 365 * DAY_MS),
                graceUntil: new Date(Date.now() + 455 * DAY_MS),
                license: 'jws',
                signature: 'sig',
                signingKid: 'nango'
            })
        ).unwrap();
    }
    return { uuid: installation.uuid, kid: key.kid, privateKeyPem };
}
