#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/.." && pwd)"

cd "${repo_dir}"

node --check spikes/figma-writer/code.js
node --test spikes/figma-writer/tests/domain.test.js

node --check spikes/figma-bridge/bridge.js
node --check spikes/figma-bridge/client.js
node --check spikes/figma-bridge/code.js
node --test spikes/figma-bridge/tests/bridge.test.js
