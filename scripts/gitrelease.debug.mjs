#!/usr/bin/env zx
import { $, echo } from 'zx';

const { GITHUB_TOKEN } = process.env;
const nextVersion = process.argv[3];
const branch = process.argv[4] || 'master';

echo`Publishing ${nextVersion} on branch ${branch}`;

await $`git config --global user.email "contact@nango.dev"`;
await $`git config --global user.name "Release Bot"`;

const remoteOutput = await $`git remote get-url origin`;
echo`Current remote URL: ${remoteOutput.stdout.trim()}`;

// await $`git remote set-url origin https://x-access-token:${GITHUB_TOKEN}@github.com/NangoHQ/nango.git`;
//
// const remoteOutputAfter = await $`git remote get-url origin`;
// echo`Updated remote URL: ${remoteOutputAfter.stdout.trim()}`;

await $`git tag -a debug-release-0.0.0 HEAD -m "Debug release 0.0.0"`;

echo`Pushing`;
await $`git push --follow-tags origin HEAD:refs/heads/${branch}`;
await $`git push --tags`;

echo`✅ Done`;
