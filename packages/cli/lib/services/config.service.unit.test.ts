import { describe, expect, it } from 'vitest';
import { validateYaml } from './config.service';
import yaml from 'js-yaml';

describe('validate', () => {
    it('should validate empty yaml', () => {
        const res = validateYaml(yaml.load(``));
        expect(res).toStrictEqual([
            {
                msg: 'Invalid file format, you should have at least an `integrations` property at the root level. Check our documentation https://docs.nango.dev/reference/integration-configuration'
            }
        ]);
    });

    it('should require sync to be object', () => {
        const res = validateYaml(
            yaml.load(`
integrations:
  test:
    syncs:
      foobar:
`)
        );
        expect(res).toStrictEqual([
            {
                code: 'type',
                msg: 'must be object',
                params: { type: 'object' },
                path: '/integrations/test/syncs/foobar'
            }
        ]);
    });

    it('should require some fields in sync', () => {
        const res = validateYaml(
            yaml.load(`
integrations:
  test:
    syncs:
      foobar:
        input: boolean
`)
        );
        expect(res).toMatchObject([
            {
                msg: 'An endpoint property is required to specify how to retrieve the data from the sync.',
                path: '/integrations/test/syncs/foobar'
            },
            {
                msg: 'An output property is required to specify what is the outcome of the sync.',
                path: '/integrations/test/syncs/foobar'
            }
        ]);
    });

    it('should disallow extra properties', () => {
        const res = validateYaml(
            yaml.load(`
integrations:
  test:
    syncs:
      foobar:
        endpoint: GET /test
        output: boolean
        iinput: boolean
`)
        );
        expect(res).toStrictEqual([
            {
                code: 'additionalProperties',
                msg: 'must NOT have additional properties',
                params: { additionalProperty: 'iinput' },
                path: '/integrations/test/syncs/foobar'
            }
        ]);
    });
});
