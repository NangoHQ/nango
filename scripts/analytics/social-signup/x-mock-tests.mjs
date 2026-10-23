// Unsaved PostHog bridge tests. testFetch replaces all external calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { configuration } from './x-config.mjs';

const base = {
    event: {
        event: 'auth:account_create',
        timestamp: '2026-10-23T07:00:00Z',
        distinct_id: 'account-123',
        properties: {
            surface: 'server',
            host: 'https://api.nango.dev',
            $groups: { company: '123' },
            is_signup_creator_internal: false,
            advertising_x_consent_method: 'explicit',
            advertising_x_consent_timestamp: '2026-10-23T06:59:00Z',
            advertising_x_click_id: 'testclick',
            advertising_x_click_timestamp: '2026-10-23T06:00:00Z',
            email: 'never-send@example.invalid',
            advertising_reddit_click_id: 'never-send-reddit'
        }
    },
    groups: { company: { properties: {} } },
    testResponse: { status: 200, body: { outcome: 'accepted', reason: 'receipt' } }
};
const inputs = { routeSecret: 'FAKE_ROUTE_SECRET_FOR_MOCKS_ONLY_12345', deliveryApproved: true, dryRun: false };
const cases = [];
function add(name, mutate = () => {}, expected = { status: 'success', calls: 1, log: 'X conversion receipt accepted' }) {
    const c = { name, globals: structuredClone(base), inputs: { ...inputs }, expected };
    mutate(c);
    cases.push(c);
}
const skip = (log) => ({ status: 'success', calls: 0, log: `SKIP: ${log}` });
add('accepted');
add('duplicate');
add('qa-metadata', (c) => {
    c.globals.event.properties.meta_test_fixture = false;
    c.globals.event.properties.acquisition_utm_campaign = 'paid_q4';
});
add(
    'dry-run',
    (c) => {
        c.inputs.dryRun = true;
    },
    { status: 'success', calls: 0, log: 'X adapter dry run eligible' }
);
add(
    'unapproved',
    (c) => {
        c.inputs.deliveryApproved = false;
    },
    skip('delivery not approved')
);
for (const event of ['auth:user_create', 'auth:user_login', '$pageview'])
    add(
        event,
        (c) => {
            c.globals.event.event = event;
        },
        skip('wrong event or origin')
    );
add(
    'dev',
    (c) => {
        c.globals.event.properties.host = 'https://api-development.nango.dev';
    },
    skip('wrong event or origin')
);
add(
    'identity',
    (c) => {
        c.globals.event.distinct_id = 'user-123';
    },
    skip('account mismatch')
);
for (const value of [true, null, undefined])
    add(
        `creator-${value}`,
        (c) => {
            c.globals.event.properties.is_signup_creator_internal = value;
        },
        skip('internal or unknown identity')
    );
add(
    'internal-group',
    (c) => {
        c.globals.groups.company.properties.is_internal = true;
    },
    skip('internal or unknown identity')
);
for (const key of ['consent_method', 'consent_timestamp', 'click_timestamp'])
    add(
        `missing-${key}`,
        (c) => {
            delete c.globals.event.properties[`advertising_x_${key}`];
        },
        skip('X context missing')
    );
for (const click of [undefined, 'bad@email', 'a'.repeat(513)])
    add(
        `click-${cases.length}`,
        (c) => {
            c.globals.event.properties.advertising_x_click_id = click;
        },
        skip('X click missing')
    );
for (const click of ['om_qa', 'synthetic_qa'])
    add(
        click,
        (c) => {
            c.globals.event.properties.advertising_x_click_id = click;
        },
        skip('QA')
    );
for (const status of [400, 401, 403, 404])
    add(
        `terminal-${status}`,
        (c) => {
            c.globals.testResponse = { status, body: 'PRIVATE_SENTINEL' };
        },
        { status: 'error', calls: 1, log: 'X adapter delivery rejected' }
    );
for (const status of [429, 503])
    add(
        `retry-${status}`,
        (c) => {
            c.globals.testResponse = { status, body: 'PRIVATE_SENTINEL' };
        },
        { status: 'error', calls: 1, log: `X adapter retryable HTTP ${status}` }
    );
add(
    'platform-rejection',
    (c) => {
        c.globals.testResponse.body = { outcome: 'rejected', reason: 'PRIVATE_SENTINEL' };
    },
    { status: 'error', calls: 1, log: 'X conversion delivery rejected' }
);
for (const body of ['PRIVATE_SENTINEL', {}, { outcome: 'accepted', reason: 'PRIVATE_SENTINEL' }])
    add(
        `invalid-${cases.length}`,
        (c) => {
            c.globals.testResponse.body = body;
        },
        { status: 'error', calls: 1, log: 'X adapter receipt invalid' }
    );
add(
    'transport',
    (c) => {
        c.globals.testResponse = { transportError: true };
    },
    { status: 'error', calls: 1, log: 'X adapter transport failure' }
);

export function invocations(id) {
    return cases.map((c) => {
        const config = configuration();
        return {
            name: c.name,
            request: {
                id,
                configuration: {
                    ...config,
                    filters: {},
                    hog:
                        "fn testFetch(url, options) { print(concat('TEST_CALL ', jsonStringify({'url':url,'options':options}))); if (testResponse.transportError == true) { throw Error('PRIVATE_SENTINEL') }; return testResponse }\n" +
                        config.hog.replaceAll('fetch(', 'testFetch('),
                    inputs: Object.fromEntries(Object.entries(c.inputs).map(([key, value]) => [key, { value }]))
                },
                globals: c.globals,
                mock_async_functions: true
            }
        };
    });
}
export function verify(results) {
    assert.equal(results.length, cases.length);
    const payloads = new Map();
    for (const c of cases) {
        const text =
            results
                .find((r) => r.name === c.name)
                ?.result?.content?.filter((x) => x.type === 'text')
                .map((x) => x.text)
                .join('\n') ?? '';
        assert.match(text, new RegExp(`^status: ${c.expected.status}$`, 'm'), c.name);
        assert.ok(text.includes(c.expected.log), c.name);
        assert.ok(!text.includes('PRIVATE_SENTINEL'), c.name);
        const calls = text
            .split('\n')
            .filter((line) => line.includes(',"TEST_CALL '))
            .map((line) => JSON.parse(JSON.parse(line.slice(line.indexOf(',"TEST_CALL ') + 1)).slice('TEST_CALL '.length)));
        assert.equal(calls.length, c.expected.calls, c.name);
        for (const call of calls) {
            assert.equal(call.url, 'https://api.nango.dev/internal/analytics/x-signup');
            assert.deepEqual(call.options.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer ***REDACTED***' });
            assert.deepEqual(call.options.body, {
                event: 'auth:account_create',
                timestamp: base.event.timestamp,
                companyId: '123',
                distinctId: 'account-123',
                surface: 'server',
                host: 'https://api.nango.dev',
                isSignupCreatorInternal: false,
                consentMethod: 'explicit',
                consentTimestamp: base.event.properties.advertising_x_consent_timestamp,
                clickId: 'testclick',
                clickTimestamp: base.event.properties.advertising_x_click_timestamp,
                ...(typeof c.globals.event.properties.meta_test_fixture === 'boolean' ? { isTestFixture: c.globals.event.properties.meta_test_fixture } : {}),
                ...(typeof c.globals.event.properties.acquisition_utm_campaign === 'string'
                    ? { utmCampaign: c.globals.event.properties.acquisition_utm_campaign }
                    : {})
            });
            payloads.set(c.name, call.options.body);
        }
    }
    assert.deepEqual(payloads.get('accepted'), payloads.get('duplicate'));
    return `${cases.length} deterministic X bridge Hog cases passed; no HTTP, live OAuth, retries or X receipts verified.`;
}
if (process.argv[2] === 'generate') {
    assert.ok(process.argv[3]);
    const requests = invocations(process.argv[3]);
    for (const { request } of requests) assert.ok(!/\bfetch\s*\(/.test(request.configuration.hog));
    process.stdout.write(JSON.stringify(requests));
} else if (process.argv[2] === 'verify') console.log(verify(JSON.parse(readFileSync(process.argv[3], 'utf8'))));
