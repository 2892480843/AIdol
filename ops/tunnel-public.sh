#!/bin/sh
set -eu
# Expose the local frontend on a public HTTPS URL without a server.
#
# Pinggy's free tier forwards over SSH on port 443, which is the only outbound path this
# machine's TUN proxy leaves usable: Cloudflare Tunnel's 7844 edge is blocked and its 443
# edge gets replaced by an expired MITM certificate. A free session lasts up to 60 minutes and
# the hostname changes on every run, so this script rewrites NEXTAUTH_URL and recreates only
# the frontend container whenever the host changes.
#
# The server also drops idle connections well before the 60-minute cap, so the tunnel runs
# under a supervisor that reconnects and a keep-alive poke that keeps it counting as active.
#
# Usage: ops/tunnel-public.sh
# Stop:  Ctrl-C

cd "$(dirname "$0")/.."

PORT="${TUNNEL_PORT:-3000}"
LOG="${TUNNEL_LOG:-/tmp/wardrowbe-tunnel.log}"
URLFILE="${TUNNEL_URL_FILE:-/tmp/wardrowbe-public-url.txt}"
HOST="${TUNNEL_HOST:-a.pinggy.io}"
KEEPALIVE="${TUNNEL_KEEPALIVE:-240}"

SSH_PID=""

cleanup() {
  [ -n "$SSH_PID" ] && kill "$SSH_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

apply_public_url() {
  url=$1
  # NextAuth rejects callbacks whose host does not match NEXTAUTH_URL, so a stale value turns
  # every sign-in into a redirect back to localhost.
  tmp=$(mktemp)
  awk -v u="$url" '
    BEGIN { done = 0 }
    /^NEXTAUTH_URL=/ { print "NEXTAUTH_URL=" u; done = 1; next }
    { print }
    END { if (!done) print "NEXTAUTH_URL=" u }
  ' .env >"$tmp" && mv "$tmp" .env

  echo "Recreating frontend with callback host ${url} ..."
  ./local.sh up -d --no-deps frontend >/dev/null

  i=0
  while [ $i -lt 60 ]; do
    code=$(curl --noproxy '*' -s -m 10 -o /dev/null -w '%{http_code}' "${url}/login" 2>/dev/null || true)
    [ "$code" = "200" ] && break
    sleep 1
    i=$((i + 1))
  done

  if [ "$code" = "200" ]; then
    echo "Ready: ${url}/login"
  else
    echo "Tunnel is up but /login answered ${code}."
  fi
  printf '%s\n' "$url" >"$URLFILE"
}

CURRENT=""
while :; do
  pkill -f "ssh -p 443 .*${HOST}" 2>/dev/null || true
  rm -f "$LOG"

  echo "Opening tunnel to localhost:${PORT} ..."
  ssh -p 443 \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -n -T \
    -R0:localhost:"${PORT}" "${HOST}" >"$LOG" 2>&1 &
  SSH_PID=$!

  url=""
  i=0
  while [ $i -lt 40 ]; do
    url=$(grep -oE 'https://[a-z0-9-]+\.run\.pinggy-free\.link' "$LOG" 2>/dev/null | head -1 || true)
    [ -n "$url" ] && break
    kill -0 "$SSH_PID" 2>/dev/null || break
    sleep 1
    i=$((i + 1))
  done

  if [ -z "$url" ]; then
    echo "No public URL yet; retrying in 5s."
    tail -3 "$LOG" 2>/dev/null || true
    sleep 5
    continue
  fi

  if [ "$url" != "$CURRENT" ]; then
    CURRENT="$url"
    echo
    echo "Public URL: $url"
    apply_public_url "$url"
    echo "Session expires within 60 minutes; the supervisor reconnects on drop."
    echo
  else
    echo "Reconnected on the same host: $url"
  fi

  # The free tier closes connections that look idle, so touch the public URL periodically.
  (
    while kill -0 "$SSH_PID" 2>/dev/null; do
      sleep "$KEEPALIVE"
      kill -0 "$SSH_PID" 2>/dev/null || break
      curl --noproxy '*' -s -m 10 -o /dev/null "${url}/login" 2>/dev/null || true
    done
  ) &
  POKE_PID=$!

  wait "$SSH_PID" 2>/dev/null || true
  kill "$POKE_PID" 2>/dev/null || true

  echo "Tunnel dropped; reconnecting in 3s."
  sleep 3
done
