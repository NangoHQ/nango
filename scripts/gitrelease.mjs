#!/usr/bin/env zx
import { $, echo } from 'zx';

const { GITHUB_TOKEN } = process.env;
const nextVersion = process.argv[3];
const branch = process.argv[4] || 'master';
const nextTag = `v${nextVersion}`;

echo`Publishing ${nextVersion} on branch ${branch}`;
const tagExists = await $`git tag -l ${nextTag}`;
if (tagExists.stdout !== '') {
    echo`Tag ${nextTag} already exists`;
    process.exit(1);
}

const releaseMessage = `chore(release): ${nextVersion} [skip ci]`;
await $`git add -A package.json package-lock.json packages/**/package.json `;
await $`git commit -am ${releaseMessage}`;
await $`git tag -a ${nextTag} HEAD -m ${releaseMessage}`;
await $`npx git-cliff -o CHANGELOG.md`;
await $`git add CHANGELOG.md`;
await $`git commit --amend`;
await $`git push --follow-tags origin HEAD:refs/heads/${branch}`;

// Push GitHub release
const releaseNotes = $`npx git-cliff --latest`;
const releaseData = JSON.stringify({
    name: nextTag,
    tag_name: nextTag,
    body: releaseNotes.stdout
});

await $`curl -H "Authorization: token ${GITHUB_TOKEN}" -H "Accept: application/vnd.github.v3+json" https://api.github.com/repos/NangoHQ/nango/releases -d ${releaseData}`;
