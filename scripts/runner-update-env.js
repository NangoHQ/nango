#!/usr/bin/env node

// Update environment variables for all runners in the given environment

const apiUrl = 'https://api.render.com/v1';

if (!process.env.ENVIRONMENT || !process.env.OWNER_ID || !process.env.RENDER_API_KEY || !process.env.KEY || !process.env.VALUE) {
    help();
    process.exit(1);
}

console.log('Listing runners...');
const runners = await fetchRunners();
console.log(`Found ${runners.length} runners`);
console.log('Updating env vars...');

for (let i = 0; i < runners.length; i++) {
    const runner = runners[i];
    await updateEnvVar(runner.id, process.env.KEY, process.env.VALUE);
    console.log(`${i + 1} of ${runners.length}: ${runner.name}`);
}

console.log();
console.log('Remember: these changes will not take effect until the runner is restarted.');
console.log();

function help() {
    console.log();
    console.log(
        'Usage: ENVIRONMENT=<env> OWNER_ID=<OWNER_ID> RENDER_API_KEY=<RENDER_API_KEY> KEY=<ENV-KEY> VALUE=<ENV-VALUE> node ./scripts/runner-update-env.js'
    );
    console.log();
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRunners() {
    let services = [];
    let cursor = '';

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const params = new URLSearchParams({
            limit: 100,
            cursor,
            type: 'private_service',
            ownerId: process.env.OWNER_ID
        });

        const response = await fetch(`${apiUrl}/services?${params.toString()}`, {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.RENDER_API_KEY}`
            }
        });

        const fetched = await response.json();
        if (fetched.length === 0) {
            break;
        }

        cursor = fetched[fetched.length - 1].cursor;
        console.log(cursor);

        // eslint-disable-next-line prettier/prettier
        const filteredServices = fetched
            .map((item) => item.service)
            .filter((service) => 
                service.name.startsWith(`${process.env.ENVIRONMENT}-runner-`));

        services = services.concat(filteredServices);

        if (!response.headers.get('ratelimit-remaining') || !response.headers.get('ratelimit-reset')) {
            throw new Error('Unexpected API format: no rate limit headers');
        }

        const remaining = parseInt(response.headers.get('ratelimit-remaining'));
        const resetMs = (parseInt(response.headers.get('ratelimit-reset')) + 1) * 1000;

        await sleep(Math.ceil(resetMs / remaining));
    }

    return services;
}

async function updateEnvVar(serviceId, key, value) {
    const response = await fetch(`${apiUrl}/services/${serviceId}/env-vars/${key}`, {
        method: 'PUT',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.RENDER_API_KEY}`
        },
        body: JSON.stringify({
            value
        })
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Failed to update env var ${key} for service ${serviceId}\n${body}`);
    }

    if (!response.headers.get('ratelimit-remaining') || !response.headers.get('ratelimit-reset')) {
        throw new Error('Unexpected API format: no rate limit headers');
    }

    const remaining = parseInt(response.headers.get('ratelimit-remaining'));
    const resetMs = (parseInt(response.headers.get('ratelimit-reset')) + 1) * 1000;

    await sleep(Math.ceil(resetMs / remaining));
}
