#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

mkdir -p "${HOME}/.cargo/registry" "${HOME}/.cargo/git" "${HOME}/.npm"

podman run --rm \
  -v "${repo_root}:/workspace" \
  -v "${HOME}/.cargo/registry:/root/.cargo/registry" \
  -v "${HOME}/.cargo/git:/root/.cargo/git" \
  -v "${HOME}/.npm:/root/.npm" \
  -w /workspace \
  ubuntu:22.04 \
  bash -lc '
    set -euo pipefail
    export DEBIAN_FRONTEND=noninteractive

    apt-get update
    apt-get install -y \
      ca-certificates \
      curl \
      git \
      file \
      xdg-utils \
      build-essential \
      pkg-config \
      libwebkit2gtk-4.1-dev \
      libgtk-3-dev \
      libayatana-appindicator3-dev \
      librsvg2-dev \
      patchelf

    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs

    curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
    . /root/.cargo/env
    rustup default stable
    export CARGO_TARGET_DIR=/tmp/romm-launcher-target-container

    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi

    npm run tauri:build:steamdeck

    mkdir -p /workspace/src-tauri/target/release/bundle/appimage
    find /tmp/romm-launcher-target-container/release/bundle/appimage -maxdepth 1 -type f -name "*.AppImage" -exec cp -f {} /workspace/src-tauri/target/release/bundle/appimage/ \;
  '
