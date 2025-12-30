import { Engine } from 'json-rules-engine';

import { Err, Ok } from '@nangohq/utils';

import { envs } from '../env.js';

import type { NangoProps, Result } from '@nangohq/types';
import type { RuleProperties } from 'json-rules-engine';

const rules = envs.RUNNER_FLEET_RULES.length
    ? envs.RUNNER_FLEET_RULES
    : [
          {
              priority: 0,
              conditions: { all: [{ fact: 'always', operator: 'equal', value: true }] },
              event: { type: envs.RUNNER_FLEET_ID }
          }
      ];

const engine = new Engine(rules.map((rule) => rule as RuleProperties));

export async function getFleetId(nangoProps: NangoProps): Promise<Result<string | undefined>> {
    try {
        const { events } = await engine.run({ always: true, nangoProps });
        if (events.length) {
            return Ok(events[0]?.type);
        } else {
            return Ok(undefined);
        }
    } catch (err: any) {
        return Err(new Error('Error evaluating fleet rules', { cause: err }));
    }
}
