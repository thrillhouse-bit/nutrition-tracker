#!/usr/bin/env bash
# Store a secret in .env without it ever touching shell history, argv, or git.
#
#   ./set-env.sh OURA_CLIENT_SECRET
#
# Prompts for the value with input hidden, then upserts KEY=value into .env
# (replacing any existing line for that key) and locks the file to 0600.
# The value is typed at the prompt — it is never a command argument, so it
# doesn't land in your shell history or `ps` output. .env is gitignored.
#
# Bash shebang on purpose: it runs correctly even when your interactive shell
# is zsh (macOS default), whose `read` flags differ from bash's.
set -euo pipefail

[ $# -eq 1 ] || { echo "usage: ./set-env.sh VARNAME" >&2; exit 1; }
key=$1
[[ $key =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "invalid variable name: $key" >&2; exit 1; }

cd "$(dirname "$0")"
env_file=.env
touch "$env_file"
chmod 600 "$env_file"

printf 'Value for %s (input hidden): ' "$key" >&2
IFS= read -rs value
echo >&2

tmp=$(mktemp "${env_file}.XXXXXX")
chmod 600 "$tmp"
grep -vE "^${key}=" "$env_file" > "$tmp" || true
printf '%s=%s\n' "$key" "$value" >> "$tmp"
mv "$tmp" "$env_file"

echo "Saved $key to .env (chmod 600, gitignored)." >&2
