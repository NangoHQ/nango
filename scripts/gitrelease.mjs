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

echo`Checkout out branch`;
await $`git fetch`;
await $`git switch ${branch}`;

echo`Generating changelog`;
await $`npx git-cliff -o CHANGELOG.md -t ${nextVersion}`;

echo`Adding file`;
await $`git add -A package.json package-lock.json packages/**/package.json CHANGELOG.md`;

echo`Creating commit`;
await $`git -c user.name="Release Bot" -c user.email="contact@nango.dev" commit --allow-empty --author="Release Bot <actions@contact@nango.dev>" -m ${releaseMessage} `;

echo`Creating tag`;
await $`git -c user.name="Release Bot" -c user.email="contact@nango.dev" tag -a ${nextTag} HEAD -m ${releaseMessage}`;

echo`Pushing`;
await $`git push --follow-tags origin HEAD:refs/heads/${branch}`;
await $`git push --tags`;

echo`Commit pushed, publishing release...`;
// Push GitHub release
const releaseNotes = await $`npx git-cliff --latest`;
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
