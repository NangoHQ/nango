import { isProd, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { Runner } from '../../../runner/runner.js';
import { getOrStartRunner, getRunnerId } from '../../../runner/runner.js';

export async function getRunner(teamId: number): Promise<Result<Runner>> {
    // a runner per account in prod only
    const runnerId = isProd ? getRunnerId(`${teamId}`) : getRunnerId('default');
    // fallback to default runner if account runner isn't ready yet
    const runner = await getOrStartRunner(runnerId).catch(() => getOrStartRunner(getRunnerId('default')));
    return Ok(runner);
}
