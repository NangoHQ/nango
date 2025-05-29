#!/usr/bin/env zx
import { $, echo } from 'zx';

const { GITHUB_TOKEN } = process.env;
const nextVersion = process.argv[3];
const branch = process.argv[4] || 'master';
const nextTag = `v${nextVersion}`;

echo`Publishing ${nextVersion} on branch ${branch}`;

await $`git config --global user.email "contact@nango.dev"`;
await $`git config --global user.name "Release Bot"`;

const tagExists = await $`git tag -l ${nextTag}`;
if (tagExists.stdout !== '') {
    echo`Tag ${nextTag} already exists`;
    process.exit(1);
}

const releaseMessage = `chore(release): ${nextVersion}`;

echo`Checkout out branch`;
await $`git fetch origin ${branch}`;
await $`git switch ${branch}`;

echo`Generating changelog`;
await $`npx git-cliff -o CHANGELOG.md -t ${nextTag}`;

echo`Adding file`;
await $`git add -A package.json package-lock.json packages/**/package.json CHANGELOG.md packages/**/lib/version.ts`;

echo`Creating commit`;
await $`git commit --allow-empty --author="Release Bot <contact@nango.dev>" -m ${releaseMessage} `;

echo`Creating tag`;
await $`git tag -a ${nextTag} HEAD -m ${releaseMessage}`;

echo`Pushing`;
await $`git push --follow-tags origin HEAD:refs/heads/${branch}`;
await $`git push --tags origin`;

echo`Commit pushed, publishing release...`;
// Push GitHub release
const releaseNotes = await $`npx git-cliff --latest --strip header footer`;
const releaseData = JSON.stringify({
    name: nextTag,
    tag_name: nextTag,
    body: releaseNotes.stdout
});

try {
    await $`curl --silent --fail --show-error -H "Authorization: Bearer ${GITHUB_TOKEN}" -H "Accept: application/vnd.github.v3+json" https://api.github.com/repos/NangoHQ/nango/releases -d ${releaseData}`;
} catch (err) {
    console.log(err, releaseData);
    process.exit(1);
}

echo`✅ Done`;
