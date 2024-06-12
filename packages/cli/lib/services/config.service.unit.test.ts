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
        runs: every day
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
        runs: every day
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

    it('should enforce endpoint format', () => {
        const res = validateYaml(
            yaml.load(`
integrations:
  test:
    syncs:
      foobar:
        runs: every day
        endpoint: /test
        output: boolean
`)
        );
        expect(res).toMatchObject([
            {
                msg: 'endpoint must be a URI (or an array of URIs) with an HTTP verb, i.e: "GET /tickets/ticket"',
                path: '/integrations/test/syncs/foobar/endpoint'
            }
        ]);
    });

    it('should prevent incorrect HTTP verb for sync endpoint ', () => {
        const res = validateYaml(
            yaml.load(`
integrations:
  test:
    sync:
      foobar:
        endpoint: DELETE /test
        output: boolean
`)
        );
        expect(res).toMatchObject([]);
    });

    it('should allow endpoint format for action', () => {
        const res = validateYaml(
            yaml.load(`
integrations:
  test:
    actions:
      foobar:
        endpoint: DELETE /test
        output: boolean
`)
        );
        expect(res).toMatchObject([]);
    });
});
