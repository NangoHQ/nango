import { Fleet } from '@nangohq/fleet';
import { Ok, useLambda } from '@nangohq/utils';

import { envs } from './env.js';

import type { Result } from '@nangohq/utils';

const fleets: Fleet[] = [];

if (useLambda) {
    fleets.push(new Fleet({ fleetId: envs.RUNNER_LAMBDA_FLEET_ID }));
}

fleets.push(new Fleet({ fleetId: envs.RUNNER_FLEET_ID }));

export async function migrateFleets(): Promise<Result<void>> {
    for (const fleet of fleets) {
        await fleet.migrate();
    }
    return Ok(undefined);
}

export async function stopFleets(): Promise<Result<void>> {
    for (const fleet of fleets) {
        await fleet.stop();
    }
    return Ok(undefined);
}
