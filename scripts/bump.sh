#!/bin/bash
set -e

usage() {
  echo "Usage: ./scripts/bump.sh --patch | --minor | --major"
  exit 1
}

if [ -z "$1" ]; then usage; fi

CURRENT=$(cat .version)
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$1" in
  --patch) PATCH=$((PATCH + 1)) ;;
  --minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  --major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  *) usage ;;
esac

VERSION="${MAJOR}.${MINOR}.${PATCH}"
TAG="v${VERSION}"

if git tag -l "$TAG" | grep -qxF "$TAG"; then
  echo "Error: tag $TAG already exists locally"
  exit 1
fi

if git ls-remote --tags origin "refs/tags/$TAG" | grep -q "$TAG"; then
  echo "Error: tag $TAG already exists on remote"
  exit 1
fi

STAGED=$(git diff --cached --name-only)
if [ -n "$STAGED" ]; then
  echo "Error: staged changes present. Commit or unstage them first."
  exit 1
fi

DIRTY=$(git diff --name-only)
if [ -n "$DIRTY" ]; then
  echo "Error: working tree is dirty. Commit or stash changes first."
  echo "$DIRTY"
  exit 1
fi

echo "Bumping ${CURRENT} → ${VERSION}"

echo -n "$VERSION" > .version

if [ -f app/package.json ]; then
  sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" app/package.json
fi

if [ -f src-tauri/tauri.conf.json ]; then
  sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" src-tauri/tauri.conf.json
fi

if [ -f src-tauri/Cargo.toml ]; then
  sed -i '' "s/^version = \"[^\"]*\"/version = \"${VERSION}\"/" src-tauri/Cargo.toml
  (cd src-tauri && cargo generate-lockfile 2>/dev/null || true)
fi

git add -A
git commit -m "bump: v${VERSION}"
git tag "$TAG"
git push --follow-tags

echo "Released ${TAG} (${CURRENT} → ${VERSION})"
