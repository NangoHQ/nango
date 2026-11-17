#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_SLOT = 9;

const PORTS = {
    NANGO_WEBAPP_PORT: 0,
    SERVER_PORT: 3,
    NANGO_JOBS_PORT: 5,
    NANGO_PERSIST_PORT: 7,
    NANGO_ORCHESTRATOR_PORT: 8,
    NANGO_CONNECT_UI_PORT: 9
};

const URLS = {
    NANGO_SERVER_URL: 3,
    JOBS_SERVICE_URL: 5,
    PERSIST_SERVICE_URL: 7,
    ORCHESTRATOR_SERVICE_URL: 8,
    NANGO_PUBLIC_CONNECT_URL: 9
};

const SLOT_0_URL = /^(https?:\/\/(?:localhost|127\.0\.0\.1):)30(\d\d)(?!\d)(.*)$/s;

export function parseSlot(value) {
    if (value === undefined || value === '') {
        return 0;
    }
    const slot = Number(value);
    if (!Number.isInteger(slot) || slot < 0 || slot > MAX_SLOT) {
        throw new Error(`NANGO_DEV_SLOT must be an integer from 0 to ${MAX_SLOT}, got "${value}"`);
    }
    return slot;
}

export function slotEnv(slot, current = {}) {
    if (slot === 0) {
        return {};
    }
    const base = 3000 + slot * 100;
    const env = {};
    for (const [key, value] of Object.entries(current)) {
        const match = typeof value === 'string' ? value.match(SLOT_0_URL) : null;
        if (match) {
            env[key] = `${match[1]}${base + Number(match[2])}${match[3]}`;
        }
    }
    for (const [key, offset] of Object.entries(PORTS)) {
        env[key] = String(base + offset);
    }
    for (const [key, offset] of Object.entries(URLS)) {
        env[key] = `http://localhost:${base + offset}`;
    }
    return env;
}

function readDotEnv() {
    try {
        return dotenv.parse(readFileSync(path.join(ROOT, '.env'), 'utf8'));
    } catch {
        return {};
    }
}

function main() {
    const [command, ...args] = process.argv.slice(2);
    if (!command) {
        console.error('Usage: NANGO_DEV_SLOT=<n> node scripts/dev-slot.mjs <command…>');
        process.exit(1);
    }

    const slot = parseSlot(process.env['NANGO_DEV_SLOT']);
    // The services load .env themselves, but localhost URLs set there still have to move to the slot.
    const overrides = slotEnv(slot, { ...readDotEnv(), ...process.env });
    if (slot > 0) {
        console.log(
            `[dev-slot] slot ${slot}: webapp http://localhost:${overrides['NANGO_WEBAPP_PORT']}, API ${overrides['NANGO_SERVER_URL']}, Connect UI ${overrides['NANGO_PUBLIC_CONNECT_URL']}`
        );
    }

    const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...overrides } });
    // Ctrl-C already reaches the child through the process group; forwarding it would deliver it twice.
    process.on('SIGINT', () => {});
    process.on('SIGTERM', () => child.kill('SIGTERM'));
    child.on('exit', (code, signal) => process.exit(signal ? 0 : (code ?? 1)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main();
}
