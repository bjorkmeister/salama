#!/usr/bin/env bash
# Testaa selaimen komentoallekirjoituksen Teslan virallista Go-verifieriä vastaan.
# Kloonaa teslamotors/vehicle-command, rakentaa testi-"auton" (tests/fakecar.go),
# joka käyttää Teslan omaa internal/authentication-pakettia, ja ajaa kaikki
# allekirjoitetut komennot sitä vastaan. Ei ota yhteyttä Teslan palvelimiin.
# Vaatii: go, node, npm, git.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
PID=""
trap '[ -n "$PID" ] && kill $PID 2>/dev/null; rm -rf "$WORK"' EXIT

git clone -q --depth 1 https://github.com/teslamotors/vehicle-command.git "$WORK/vc"
mkdir -p "$WORK/vc/cmd/fakecar"
cp "$HERE/fakecar.go" "$WORK/vc/cmd/fakecar/main.go"
(cd "$WORK/vc" && go build -o "$WORK/fakecar" ./cmd/fakecar)
[ -d "$HERE/node_modules/protobufjs" ] || npm i --no-save --prefix "$HERE" protobufjs@7.4.0 >/dev/null

for ENC in 0 1; do
  export PORT=$((8700 + ENC)) ENCRYPT=$ENC
  "$WORK/fakecar" > "$WORK/car$ENC.log" 2>&1 &
  PID=$!
  sleep 1
  node "$HERE/vcp.test.mjs"
  kill $PID; wait $PID 2>/dev/null || true; PID=""
done
echo "OK: auto hyväksyi kaikki allekirjoitetut komennot (myös salatut vastaukset)."
