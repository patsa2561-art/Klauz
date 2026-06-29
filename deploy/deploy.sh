#!/usr/bin/env bash
# meaningdiff one-shot deploy for Ubuntu 22.04 / 24.04. Run as root (or with sudo).
#   sudo ./deploy.sh <your-domain>
# Idempotent — safe to re-run after `git pull`.
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "usage: $0 <your-domain>          (e.g. meaningdiff.example.com)"
  echo "       $0 --ip-only              (skip Caddy/TLS, expose 7700 directly — testing only)"
  exit 1
fi

echo "===== meaningdiff deploy → $DOMAIN ====="

# 1) base packages
apt-get update -y
apt-get install -y curl ca-certificates git ufw gnupg

# 2) Node 22
if ! command -v node >/dev/null || [[ "$(node -v | cut -c2- | cut -d. -f1)" -lt 18 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "node: $(node -v)"

# 3) service user
if ! id -u meaningdiff >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin meaningdiff   # needs home for npm cache
fi

# 4) install deps (this script runs from the repo root after a `git clone`)
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "repo: $REPO_ROOT"
chown -R meaningdiff:meaningdiff "$REPO_ROOT"
sudo -u meaningdiff bash -c "cd '$REPO_ROOT' && npm ci --omit=dev"

# 5) symlink to /opt/meaningdiff so systemd unit + Caddyfile work regardless of clone path
mkdir -p /opt
if [[ "$REPO_ROOT" != "/opt/meaningdiff" ]]; then
  ln -sfn "$REPO_ROOT" /opt/meaningdiff
fi

# 6) systemd
cp /opt/meaningdiff/deploy/meaningdiff.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now meaningdiff
sleep 2
systemctl --no-pager --lines=5 status meaningdiff || true

if [[ "$DOMAIN" == "--ip-only" ]]; then
  echo
  echo "===== ip-only mode ====="
  echo "Edit /etc/systemd/system/meaningdiff.service:"
  echo "  Environment=MEANINGDIFF_HOST=0.0.0.0"
  echo "Then: systemctl daemon-reload && systemctl restart meaningdiff"
  echo "Open firewall: ufw allow 7700/tcp && ufw enable"
  echo "Visit http://<droplet-ip>:7700  (no TLS — TESTING ONLY)"
  exit 0
fi

# 7) Caddy
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y
  apt-get install -y caddy
fi

# 8) Caddyfile (substitute domain)
sed "s|YOUR_DOMAIN|$DOMAIN|g" /opt/meaningdiff/deploy/Caddyfile > /etc/caddy/Caddyfile
mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy
systemctl reload caddy || systemctl restart caddy
sleep 2
systemctl --no-pager --lines=5 status caddy || true

# 9) Firewall
ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
yes | ufw enable || true

# 10) sanity
echo
echo "===== local health check ====="
curl -fsS http://127.0.0.1:7700/health && echo "  ✓ origin alive"
curl -fsS http://127.0.0.1:7700/capabilities && echo "  ✓ capabilities OK"

cat <<EOF

===== done =====
1. In Cloudflare, add an A record:
     $DOMAIN  →  $(curl -fsS https://ifconfig.me || echo "<this-droplet-public-ip>")
     Proxy:    ON (orange cloud)
2. Cloudflare SSL/TLS  → set to "Full (strict)"
3. Wait 1–5 min for DNS + first TLS handshake, then open  https://$DOMAIN

Service:  sudo systemctl status meaningdiff caddy
Logs:     sudo journalctl -u meaningdiff -f
Update:   cd $REPO_ROOT && git pull && sudo systemctl restart meaningdiff
EOF
