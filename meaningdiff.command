#!/bin/bash
# Double-click (Mac/Linux) to launch meaningdiff. No terminal/git knowledge needed.
cd "$(dirname "$0")"

# Prefer a bundled portable Node (zero-install) if present, else system Node.
NODE_EXE="node"
[ -x "./node/bin/node" ] && NODE_EXE="./node/bin/node"

if ! "$NODE_EXE" -v >/dev/null 2>&1; then
  echo ""
  echo "  Node.js was not found."
  echo "  Easiest fix: install it once from  https://nodejs.org  (pick \"LTS\"),"
  echo "  then double-click this file again."
  echo ""
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

echo ""
echo "  meaningdiff is starting..."
echo "  Your browser will open automatically at:  http://127.0.0.1:7700"
echo "  (Keep this window open while you use it. Close it to stop.)"
echo ""
( sleep 3 && (command -v open >/dev/null && open http://127.0.0.1:7700 || xdg-open http://127.0.0.1:7700) ) &
"$NODE_EXE" bin/meaningdiff.js serve
