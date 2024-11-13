#!/usr/bin/env node

// Update environment variables for all runners in the given environment

const apiUrl = 'https://api.render.com/v1';

if (!process.env.ENVIRONMENT) {
    console.error('Please set the ENVIRONMENT environment variable');
    process.exit(1);
}

if (!process.env.OWNER_ID) {
    console.error('Please set the OWNER_ID environment variable');
    process.exit(1);
}

if (!process.env.RENDER_API_KEY) {
    console.error('Please set the RENDER_API_KEY environment variable');
    process.exit(1);
}

if (!process.env.KEY) {
    console.error('Please set the KEY environment variable');
    process.exit(1);
}

if (!process.env.VALUE) {
    console.error('Please set the VALUE environment variable');
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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRunners() {
    let services = [];
    let cursor = '';
    let running = true;

    while (running) {
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
            running = false;
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

        await sleep(1000);
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
}
