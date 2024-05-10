#!/usr/bin/env zx
import { $, echo } from 'zx';

const { GITHUB_TOKEN } = process.env;
const nextVersion = process.argv[3] || '0.39.25';
const branch = process.argv[4] || 'master';
const nextTag = `v${nextVersion}`;

echo`Publishing ${nextVersion} on branch ${branch}`;
const tagExists = await $`git tag -l ${nextTag}`;
if (tagExists.stdout !== '') {
    echo`Tag ${nextTag} already exists`;
    process.exit(1);
}

const releaseMessage = `chore(release): ${nextVersion} [skip ci]`;
await $`npx git-cliff -o CHANGELOG.md -t ${nextVersion}`;
await $`git add -A package.json package-lock.json packages/**/package.json CHANGELOG.md`;
await $`git -c user.name="Release Bot" -c user.email="contact@nango.dev" commit -am ${releaseMessage} --allow-empty --author="Release Botg <actions@contact@nango.dev>"`;
await $`git tag -a ${nextTag} HEAD -m ${releaseMessage}`;
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
