#!/usr/bin/env bash

nextVersion=$1
releaseMessage="chore(release): ${nextVersion} [skip ci]"

git add -A package.json package-lock.json packages/**/package.json CHANGELOG.md
git commit -am ${releaseMessage}
git tag -a ${nextVersion} HEAD -m ${releaseMessage}
git push --follow-tags origin HEAD:refs/heads/master
