// Generates unsaved PostHog invocations. Never makes HTTP requests itself.
// Run with: node mock-tests.mjs generate <existing-function-uuid> > /tmp/google-mocks.json
// Execute each invocation with the MCP tool and mock_async_functions=true, then save results as [{name,result}].
// Verify with: node mock-tests.mjs verify /tmp/google-mock-results.json
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { configuration } from './config.mjs';

const clone = (x) => structuredClone(x);
const inputs = {
    customerId: '1111111111',
    loginCustomerId: '1111111111',
    conversionActionId: '123',
    startAt: '2026-10-22T00:00:00Z',
    oauthClientId: 'FAKE_CLIENT',
    oauthClientSecret: 'FAKE_SECRET',
    oauthRefreshToken: 'FAKE_REFRESH',
    deliveryApproved: true,
    validateOnly: false,
    requestId: 'test-request'
};
const globals = {
    event: {
        event: 'auth:account_create',
        timestamp: '2026-10-22T20:00:00Z',
        distinct_id: 'account-123',
        properties: {
            is_signup_creator_internal: false,
            surface: 'server',
            host: 'https://api.nango.dev',
            $groups: { company: '123' },
            advertising_google_consent_method: 'explicit',
            advertising_google_ad_user_data: 'granted',
            advertising_google_ad_personalization: 'granted',
            advertising_google_consent_timestamp: '2026-10-22T19:59:00Z',
            advertising_google_click_timestamp: '2026-10-22T19:00:00Z',
            advertising_google_click_type: 'gclid',
            advertising_google_click_id: 'testclick',
            email: 'never-send@example.invalid',
            advertising_fbc: 'never-send-meta',
            advertising_oppref: 'never-send-openai'
        }
    },
    groups: { company: { properties: { is_internal: false } } },
    mockResponses: {
        'https://oauth2.googleapis.com/token': {
            status: 200,
            body: { access_token: 'FAKE_ACCESS', token_type: 'Bearer', expires_in: 3600, scope: 'https://www.googleapis.com/auth/datamanager' }
        },
        'https://datamanager.googleapis.com/v1/events:ingest': { status: 200, body: { requestId: 'test-request' } },
        'https://datamanager.googleapis.com/v1/requestStatus:retrieve?requestId=test-request': {
            status: 200,
            body: { requestStatusPerDestination: [{ requestStatus: 'SUCCESS' }] }
        }
    }
};
const cases = [];
function add(
    name,
    mutate = () => {
        /* No fixture changes. */
    },
    expected = { status: 'success', calls: 2, log: 'Google ingestion accepted' },
    diagnostics = false
) {
    const c = { name, config: configuration(diagnostics), globals: clone(globals), inputs: clone(inputs), expected, diagnostics };
    mutate(c);
    cases.push(c);
}
for (const key of ['gclid', 'wbraid', 'gbraid'])
    add(key, (c) => {
        c.globals.event.properties.advertising_google_click_type = key;
    });
add('duplicate-account');
add(
    'validate-only',
    (c) => {
        c.inputs.validateOnly = true;
    },
    { status: 'success', calls: 2, log: 'Google validation accepted; no conversion sent' }
);
const skip = (log) => ({ status: 'success', calls: 0, log });
add(
    'not-approved',
    (c) => {
        c.inputs.deliveryApproved = false;
    },
    skip('SKIP: delivery not approved')
);
add(
    'invite',
    (c) => {
        c.globals.event.event = 'auth:user_create';
    },
    skip('SKIP: wrong event or origin')
);
add(
    'returning-login',
    (c) => {
        c.globals.event.event = 'auth:user_login';
    },
    skip('SKIP: wrong event or origin')
);
add(
    'dev-origin',
    (c) => {
        c.globals.event.properties.host = 'https://api-development.nango.dev';
    },
    skip('SKIP: wrong event or origin')
);
add(
    'account-mismatch',
    (c) => {
        c.globals.event.distinct_id = 'account-456';
    },
    skip('SKIP: account mismatch')
);
for (const value of [true])
    add(
        `internal-${value}`,
        (c) => {
            c.globals.groups.company.properties.is_internal = value;
        },
        skip('SKIP: internal company conflict')
    );
add('external-creator-before-company-classification', (c) => {
    delete c.globals.groups.company.properties.is_internal;
});
for (const value of [true, null])
    add(
        `creator-internal-${value}`,
        (c) => {
            c.globals.event.properties.is_signup_creator_internal = value;
        },
        skip('SKIP: internal or unknown signup creator')
    );
add(
    'creator-classification-missing',
    (c) => {
        delete c.globals.event.properties.is_signup_creator_internal;
    },
    skip('SKIP: internal or unknown signup creator')
);
for (const key of ['advertising_google_ad_user_data', 'advertising_google_ad_personalization', 'advertising_google_consent_method'])
    add(
        `missing-${key}`,
        (c) => {
            delete c.globals.event.properties[key];
        },
        skip('SKIP: Google consent missing')
    );
add(
    'denied',
    (c) => {
        c.globals.event.properties.advertising_google_ad_user_data = 'denied';
    },
    skip('SKIP: Google consent missing')
);
add(
    'prelaunch',
    (c) => {
        c.inputs.startAt = '2026-10-22T20:00:01Z';
    },
    skip('SKIP: before launch')
);
add(
    'malformed-time',
    (c) => {
        c.globals.event.timestamp = 'bad';
    },
    skip('SKIP: missing or invalid time')
);
add(
    'stale-click',
    (c) => {
        c.globals.event.properties.advertising_google_click_timestamp = '2026-10-21T20:00:00Z';
    },
    skip('SKIP: stale or future context')
);
add(
    'future-click',
    (c) => {
        c.globals.event.properties.advertising_google_click_timestamp = '2026-10-22T20:00:01Z';
    },
    skip('SKIP: stale or future context')
);
add(
    'qa',
    (c) => {
        c.globals.event.properties.advertising_google_click_id = 'om_qa';
    },
    skip('SKIP: QA')
);
add(
    'malformed-click',
    (c) => {
        c.globals.event.properties.advertising_google_click_id = 'bad@email';
    },
    skip('SKIP: missing or malformed Google click')
);
add(
    'missing-click',
    (c) => {
        delete c.globals.event.properties.advertising_google_click_id;
    },
    skip('SKIP: missing or malformed Google click')
);
const error = (calls, log) => ({ status: 'error', calls, log });
for (const status of [400, 401, 429, 503])
    add(
        `oauth-${status}`,
        (c) => {
            c.globals.mockResponses['https://oauth2.googleapis.com/token'] = { status, body: { error: 'PRIVATE_SENTINEL' } };
        },
        error(1, `Google OAuth HTTP ${status}`)
    );
add(
    'oauth-malformed',
    (c) => {
        c.globals.mockResponses['https://oauth2.googleapis.com/token'].body = '{PRIVATE_SENTINEL';
    },
    error(1, 'Google returned non-JSON body')
);
add(
    'oauth-scope',
    (c) => {
        c.globals.mockResponses['https://oauth2.googleapis.com/token'].body.scope = 'https://www.googleapis.com/auth/analytics';
    },
    error(1, 'Google OAuth scope missing')
);
for (const status of [400, 401, 429, 503])
    add(
        `ingest-${status}`,
        (c) => {
            c.globals.mockResponses['https://datamanager.googleapis.com/v1/events:ingest'] = { status, body: { error: 'PRIVATE_SENTINEL' } };
        },
        error(2, `Google ingest HTTP ${status}`)
    );
add(
    'missing-request-id',
    (c) => {
        c.globals.mockResponses['https://datamanager.googleapis.com/v1/events:ingest'].body = {};
    },
    error(2, 'Google ingest missing request ID')
);
add(
    'field-warning',
    (c) => {
        c.globals.mockResponses['https://datamanager.googleapis.com/v1/events:ingest'].body.fieldWarnings = [
            { reason: 'WARNING_REASON_GENERIC', description: 'PRIVATE_SENTINEL' }
        ];
    },
    { status: 'success', calls: 2, log: 'Google field warning: WARNING_REASON_GENERIC' }
);
for (const state of ['SUCCESS', 'PROCESSING', 'FAILED', 'PARTIAL_SUCCESS'])
    add(
        `diagnostics-${state}`,
        (c) => {
            c.globals.mockResponses['https://datamanager.googleapis.com/v1/requestStatus:retrieve?requestId=test-request'].body.requestStatusPerDestination[0] =
                {
                    requestStatus: state,
                    errorInfo: {
                        errorCounts:
                            state.includes('FAIL') || state === 'PARTIAL_SUCCESS' ? [{ reason: 'PROCESSING_ERROR_REASON_INVALID_GCLID', recordCount: '1' }] : []
                    }
                };
        },
        { status: ['FAILED', 'PARTIAL_SUCCESS'].includes(state) ? 'error' : 'success', calls: 2, log: `Google processing status: ${state}` },
        true
    );
add(
    'diagnostics-duplicate',
    (c) => {
        c.globals.mockResponses['https://datamanager.googleapis.com/v1/requestStatus:retrieve?requestId=test-request'].body.requestStatusPerDestination[0] = {
            requestStatus: 'FAILED',
            errorInfo: { errorCounts: [{ reason: 'PROCESSING_ERROR_REASON_DUPLICATE_TRANSACTION_ID', recordCount: '1' }] }
        };
    },
    { status: 'success', calls: 2, log: 'Google already has this transaction' },
    true
);

export function invocations(id) {
    return cases.map((c) => ({
        name: c.name,
        request: {
            id,
            configuration: {
                ...c.config,
                filters: {},
                // A synchronous replacement tests the real handler after both HTTP responses. No network-capable fetch remains.
                hog:
                    "fn testFetch(url, options) { print(concat('TEST_CALL ', jsonStringify({'url': url, 'options': options}))); return mockResponses[url] }\n" +
                    c.config.hog.replaceAll('fetch(', 'testFetch('),
                inputs: Object.fromEntries(
                    Object.entries(c.inputs)
                        .filter(([key]) => c.config.inputs_schema.some((input) => input.key === key))
                        .map(([key, value]) => [key, { value }])
                )
            },
            globals: c.globals,
            mock_async_functions: true
        }
    }));
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
            .map((line) => {
                const message = JSON.parse(line.slice(line.indexOf(',"TEST_CALL ') + 1));
                return JSON.parse(message.slice('TEST_CALL '.length));
            });
        assert.equal(calls.length, c.expected.calls, c.name);
        const ingest = calls.find((x) => x.url.endsWith('/events:ingest'));
        if (ingest) {
            const body = ingest.options.body;
            assert.deepEqual(Object.keys(body).sort(), ['destinations', 'events', 'validateOnly']);
            assert.equal(body.events.length, 1);
            assert.equal(body.events[0].transactionId, 'nango:account_create:123');
            assert.equal(body.events[0].eventTimestamp, globals.event.timestamp);
            assert.deepEqual(Object.keys(body.events[0]).sort(), ['adIdentifiers', 'consent', 'eventSource', 'eventTimestamp', 'transactionId']);
            assert.deepEqual(body.events[0].adIdentifiers, { [c.globals.event.properties.advertising_google_click_type]: 'testclick' });
            assert.deepEqual(body.events[0].consent, { adUserData: 'CONSENT_GRANTED', adPersonalization: 'CONSENT_GRANTED' });
            assert.equal(body.validateOnly, c.inputs.validateOnly);
            payloads.set(c.name, body);
        }
    }
    assert.deepEqual(payloads.get('gclid'), payloads.get('duplicate-account'));
    return `${cases.length} deterministic Hog cases passed; no external HTTP, real OAuth or retry scheduling exercised.`;
}
if (process.argv[2] === 'generate') {
    assert.ok(process.argv[3], 'Pass an existing function UUID for unsaved invocation, never a provisioning command');
    const requests = invocations(process.argv[3]);
    for (const { request } of requests) assert.ok(!/\bfetch\s*\(/.test(request.configuration.hog));
    process.stdout.write(JSON.stringify(requests));
} else if (process.argv[2] === 'verify') {
    process.stdout.write(`${verify(JSON.parse(readFileSync(process.argv[3], 'utf8')))}\n`);
}
