#!/bin/bash
set -e

if [ -z "$1" ] || [ "$1" != "--version" ] || [ -z "$2" ]; then
  echo "Usage: ./scripts/tag.sh --version <semver>"
  exit 1
fi

VERSION="$2"
TAG="v${VERSION}"

if git tag -l "$TAG" | grep -q "$TAG"; then
  echo "Error: tag $TAG already exists"
  exit 1
fi

echo -n "$VERSION" > .version

STAGED=$(git diff --cached --name-only)
if [ -n "$STAGED" ]; then
  echo "Error: staged changes present. Commit or unstage them first."
  exit 1
fi

DIRTY=$(git diff --name-only)
if [ "$DIRTY" != ".version" ]; then
  echo "Error: only .version should be modified. Found:"
  echo "$DIRTY"
  exit 1
fi

git add .version
git commit -m "chore: release ${VERSION}"
git tag "$TAG"
git push --follow-tags

echo "Released ${TAG}"
