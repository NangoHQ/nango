// Unsaved invocation fixtures only. No credentials or live HTTP; testFetch replaces every fetch.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { configuration } from './reddit-config.mjs';

const eventTime = '2026-10-23T07:00:00Z';
const endpoint = 'https://ads-api.reddit.com/api/v3/pixels/test_pixel/conversion_events';
const base = {
    event: {
        event: 'auth:account_create',
        timestamp: eventTime,
        distinct_id: 'account-123',
        properties: {
            surface: 'server',
            host: 'https://api.nango.dev',
            $groups: { company: '123' },
            is_signup_creator_internal: false,
            advertising_reddit_consent_method: 'explicit',
            advertising_reddit_consent_timestamp: '2026-10-23T06:59:00Z',
            advertising_reddit_click_id: 'testclick',
            advertising_reddit_click_timestamp: '2026-10-23T06:00:00Z',
            email: 'never-send@example.invalid',
            advertising_x_click_id: 'never-send-x',
            advertising_google_click_id: 'never-send-google'
        }
    },
    groups: { company: { properties: {} } },
    testDeliveryMs: Date.parse(eventTime) + 1000,
    testResponse: { status: 200, body: { data: { message: 'Successfully processed 1 conversion events.' } } }
};
const inputs = { pixelId: 'test_pixel', startAt: '2026-10-23T00:00:00Z', accessToken: 'FAKE_TOKEN', deliveryApproved: true, dryRun: false };
const cases = [];
function add(name, mutate = () => {}, expected = { status: 'success', calls: 1, log: 'Reddit conversion receipt accepted' }) {
    const c = { name, globals: structuredClone(base), inputs: { ...inputs }, expected };
    mutate(c);
    cases.push(c);
}
const skip = (log) => ({ status: 'success', calls: 0, log: `SKIP: ${log}` });
add('valid');
add('duplicate-account');
add('implied', (c) => {
    c.globals.event.properties.advertising_reddit_consent_method = 'implied';
});
add(
    'dry-run',
    (c) => {
        c.inputs.dryRun = true;
    },
    { status: 'success', calls: 0, log: 'Reddit dry run eligible; no conversion sent' }
);
add(
    'not-approved',
    (c) => {
        c.inputs.deliveryApproved = false;
    },
    skip('delivery not approved')
);
add(
    'event-testing',
    (c) => {
        c.inputs.testId = 'test_id';
    },
    { status: 'success', calls: 1, log: 'Reddit test receipt accepted' }
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
    'web',
    (c) => {
        c.globals.event.properties.surface = 'web';
    },
    skip('wrong event or origin')
);
add(
    'account-mismatch',
    (c) => {
        c.globals.event.distinct_id = 'user-123';
    },
    skip('account mismatch')
);
add(
    'missing-company',
    (c) => {
        delete c.globals.event.properties.$groups.company;
    },
    skip('account mismatch')
);
for (const value of [true, null, undefined])
    add(
        `creator-${value}`,
        (c) => {
            c.globals.event.properties.is_signup_creator_internal = value;
        },
        skip('internal or unknown signup creator')
    );
add(
    'internal-company',
    (c) => {
        c.globals.groups.company.properties.is_internal = true;
    },
    skip('internal company conflict')
);
for (const value of ['denied', undefined])
    add(
        `consent-${value}`,
        (c) => {
            c.globals.event.properties.advertising_reddit_consent_method = value;
        },
        skip('Reddit consent missing')
    );
for (const key of ['consent', 'click']) {
    add(
        `missing-${key}-time`,
        (c) => {
            delete c.globals.event.properties[`advertising_reddit_${key}_timestamp`];
        },
        skip('missing or invalid time')
    );
    add(
        `stale-${key}`,
        (c) => {
            c.globals.event.properties[`advertising_reddit_${key}_timestamp`] = '2026-10-22T07:00:00Z';
        },
        skip('stale or future context')
    );
    add(
        `future-${key}`,
        (c) => {
            c.globals.event.properties[`advertising_reddit_${key}_timestamp`] = '2026-10-23T07:00:01Z';
        },
        skip('stale or future context')
    );
}
add(
    'malformed-time',
    (c) => {
        c.globals.event.timestamp = 'bad';
    },
    skip('missing or invalid time')
);
add(
    'prelaunch',
    (c) => {
        c.inputs.startAt = '2026-10-23T07:00:01Z';
    },
    skip('before launch')
);
add(
    'late-retry',
    (c) => {
        c.globals.testDeliveryMs = Date.parse(eventTime) + 172800000;
    },
    skip('outside delivery window')
);
add(
    'future-event',
    (c) => {
        c.globals.testDeliveryMs = Date.parse(eventTime) - 1;
    },
    skip('outside delivery window')
);
for (const click of [undefined, '', 'bad@email', 'a'.repeat(513)])
    add(
        `click-${String(click).slice(0, 15)}`,
        (c) => {
            c.globals.event.properties.advertising_reddit_click_id = click;
        },
        skip('missing or malformed Reddit click')
    );
for (const click of ['om_qa', 'synthetic_qa'])
    add(
        click,
        (c) => {
            c.globals.event.properties.advertising_reddit_click_id = click;
        },
        skip('QA')
    );
add(
    'qa-campaign',
    (c) => {
        c.globals.event.properties.acquisition_utm_campaign = 'om_qa';
    },
    skip('QA')
);
add(
    'qa-fixture',
    (c) => {
        c.globals.event.properties.meta_test_fixture = true;
    },
    skip('QA')
);
add(
    'transport-failure',
    (c) => {
        c.globals.testResponse = { transportError: true };
    },
    { status: 'error', calls: 1, log: 'Reddit transport failure' }
);
for (const status of [400, 401, 403, 404, 429, 503])
    add(
        `http-${status}`,
        (c) => {
            c.globals.testResponse = { status, body: { error: 'PRIVATE_SENTINEL' } };
        },
        { status: 'error', calls: 1, log: `Reddit conversion HTTP ${status}` }
    );
for (const body of ['PRIVATE_SENTINEL', {}, { data: { message: 'PRIVATE_SENTINEL' } }, { error: { message: 'PRIVATE_SENTINEL' } }])
    add(
        `receipt-${cases.length}`,
        (c) => {
            c.globals.testResponse.body = body;
        },
        { status: 'error', calls: 1, log: 'Reddit conversion receipt invalid' }
    );
add(
    'bad-test-id',
    (c) => {
        c.inputs.testId = '../bad';
    },
    { status: 'error', calls: 0, log: 'Reddit test configuration invalid' }
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
                        "fn testFetch(url, options) { print(concat('TEST_CALL ', jsonStringify({'url':url, 'options':options}))); if (testResponse.transportError == true) { throw Error('PRIVATE_SENTINEL') }; return testResponse }\n" +
                        config.hog.replaceAll('fetch(', 'testFetch(').replace('toUnixTimestampMilli(now())', 'testDeliveryMs'),
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
        const result = results.find((r) => r.name === c.name)?.result;
        const text =
            result?.content
                ?.filter((x) => x.type === 'text')
                .map((x) => x.text)
                .join('\n') ?? '';
        assert.match(text, new RegExp(`^status: ${c.expected.status}$`, 'm'), c.name);
        assert.ok(text.includes(c.expected.log), `${c.name}: missing ${c.expected.log}`);
        assert.ok(!text.includes('PRIVATE_SENTINEL'), `${c.name}: raw error leaked`);
        const calls = text
            .split('\n')
            .filter((line) => line.includes(',"TEST_CALL '))
            .map((line) => JSON.parse(JSON.parse(line.slice(line.indexOf(',"TEST_CALL ') + 1)).slice('TEST_CALL '.length)));
        assert.equal(calls.length, c.expected.calls, c.name);
        for (const call of calls) {
            assert.equal(call.url, endpoint);
            assert.deepEqual(Object.keys(call.options.body), ['data']);
            assert.deepEqual(call.options.body.data, {
                events: [
                    {
                        click_id: 'testclick',
                        event_at: Date.parse(eventTime),
                        action_source: 'WEBSITE',
                        type: { tracking_type: 'CUSTOM', custom_event_name: 'NangoAccountCreate' },
                        metadata: { conversion_id: 'nango:account_create:123' }
                    }
                ],
                ...(c.inputs.testId ? { test_id: c.inputs.testId } : {})
            });
            assert.deepEqual(call.options.headers, {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ***REDACTED***',
                'User-Agent': 'Nango-Account-Create/1.0'
            });
            payloads.set(c.name, call.options.body);
        }
    }
    assert.deepEqual(payloads.get('valid'), payloads.get('duplicate-account'));
    return `${cases.length} deterministic Hog cases passed; no external HTTP, real token or retry scheduling exercised.`;
}
if (process.argv[2] === 'generate') {
    assert.ok(process.argv[3], 'Pass an existing function UUID only for unsaved invocation');
    const requests = invocations(process.argv[3]);
    for (const { request } of requests) assert.ok(!/\bfetch\s*\(/.test(request.configuration.hog));
    process.stdout.write(JSON.stringify(requests));
} else if (process.argv[2] === 'verify') console.log(verify(JSON.parse(readFileSync(process.argv[3], 'utf8'))));
