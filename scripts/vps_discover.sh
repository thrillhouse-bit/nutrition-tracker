#!/usr/bin/env bash
# vps_discover.sh — read-only VPS survey before deploying the app.
#
# Answers one question: can the full stack (app + its own Caddy on 80/443) run
# here, or does this box already have a web server we must slot in beside?
# Deploying blind onto occupied ports is how a working site goes down, so this
# script MEASURES and recommends; it changes nothing.
#
# Run on the VPS:   bash vps_discover.sh
# (or:  curl -fsSL https://raw.githubusercontent.com/thrillhouse-bit/nutrition-tracker/main/scripts/vps_discover.sh | bash )
set -u

section() { printf '\n== %s ==\n' "$1"; }

section "docker"
if command -v docker >/dev/null 2>&1; then
  docker --version
  docker compose version 2>/dev/null || echo "compose plugin: MISSING (install docker-compose-plugin)"
else
  echo "docker: MISSING (install: curl -fsSL https://get.docker.com | sh)"
fi

section "who owns ports 80/443"
# Two independent measurements, because each can be blind alone: ss/netstat
# names the owning process but may be missing from a minimal image (measured:
# this script's first version reported "nothing listening" on a box with a
# live port-80 server, purely because ss was absent); a bash /dev/tcp connect
# probe needs no tools and proves a loopback listener, but names nobody and
# misses a server bound only to the public IP.
LISTENERS=""
TOOL="none"
if command -v ss >/dev/null 2>&1; then
  TOOL="ss"
  LISTENERS=$(ss -tlnp 2>/dev/null | awk '$4 ~ /:(80|443)$/')
elif command -v netstat >/dev/null 2>&1; then
  TOOL="netstat"
  LISTENERS=$(netstat -tlnp 2>/dev/null | awk '$4 ~ /:(80|443)$/')
fi
PROBE=""
for p in 80 443; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then
    exec 3>&- 3<&- 2>/dev/null
    PROBE="$PROBE $p"
  fi
done
[ -n "$LISTENERS" ] && echo "$LISTENERS"
[ -n "$PROBE" ] && echo "loopback connect probe: port(s)$PROBE ACCEPT connections"
if [ -n "$LISTENERS" ] || [ -n "$PROBE" ]; then
  PORTSTATE="occupied"
elif [ "$TOOL" != "none" ]; then
  echo "nothing listening on 80 or 443 (checked with $TOOL + connect probe)"
  PORTSTATE="free"
else
  echo "no ss/netstat on this box and the loopback probe found nothing —"
  echo "a server bound only to the public IP would be invisible here"
  PORTSTATE="unknown"
fi

section "resident web servers (systemd)"
for svc in caddy nginx apache2 httpd traefik openlitespeed lsws; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    echo "$svc: ACTIVE"
  fi
done

section "running containers"
if command -v docker >/dev/null 2>&1; then
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null || echo "docker ps failed (daemon not running?)"
fi

section "existing configs (names only)"
for f in /etc/caddy/Caddyfile /etc/nginx/nginx.conf /etc/nginx/sites-enabled; do
  [ -e "$f" ] && echo "exists: $f"
done

section "RECOMMENDATION"
case "$PORTSTATE" in
  occupied)
    cat <<'REC'
Ports 80/443 are OCCUPIED -> use the SIDECAR path:
  1. docker compose -f docker-compose.app-only.yml up -d --build
  2. Add the domain to the RESIDENT server as a reverse proxy to
     127.0.0.1:3001 (snippets in docs/DEPLOY-VERIFY.md), validate the
     config, then RELOAD (never restart) the resident server.
Do NOT run the full docker-compose.yml here - its Caddy would fight the
resident server for ports 80/443.
REC
    ;;
  free)
    cat <<'REC'
Ports 80/443 are FREE -> use the standard path:
  docker compose up -d --build
(brings the app plus its own Caddy with automatic HTTPS)
REC
    ;;
  *)
    # Unknown is not permission: recommending the full stack on a box this
    # script could not actually inspect is how a resident site goes down.
    cat <<'REC'
COULD NOT DETERMINE port state -> do not deploy yet.
Install iproute2 (for ss) and re-run, or check from another machine:
  curl -s -o /dev/null -w '%{http_code}\n' http://<this-vps-ip>/
000/timeout = ports likely free (standard path); any HTTP answer =
occupied (sidecar path).
REC
    ;;
esac
