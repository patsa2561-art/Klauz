# Deploy — meaningdiff on a small Ubuntu droplet (deterministic mode)

This folder turns the droplet at `143.198.204.73` (1 vCPU / 2 GB / Ubuntu 24.04) into
a public **deterministic** meaningdiff service behind Caddy + Cloudflare.

**Mode:** `MEANINGDIFF_ENGINE=heuristic` — rule-based only (no Ollama).
A 2 GB droplet can't run a usable judge LLM. The deterministic features
(certify / verify / lint / merge3 / scan / reverse / proof-tier with 100 %
precision on modal/negation/number/party changes) all work without AI and
already tell you **who's favored** on the legally-critical change categories.
For deeper semantic analysis, users download the desktop version.

---

## 1. Get the code onto the droplet (pick ONE)

**A. via Git (recommended).** Push your local copy to GitHub once, then on the
droplet (DO Web Console works fine, no SSH key needed):
```bash
sudo mkdir -p /opt && cd /opt
sudo git clone https://github.com/<you>/meaningdiff.git
```

**B. via scp from your Windows PowerShell** (uses your existing DO SSH key):
```powershell
scp -r D:\typecrypt\meaningdiff root@143.198.204.73:/opt/
```

**C. via tar + Web Console** (no GitHub, no SSH). On your PC:
```powershell
tar -czf meaningdiff.tar.gz -C D:\typecrypt meaningdiff
# upload meaningdiff.tar.gz somewhere you can wget (e.g. a temporary URL),
# then on the droplet: wget <url> && sudo tar -xzf meaningdiff.tar.gz -C /opt/
```

---

## 2. Run the deploy script

In the DO Web Console (or over SSH):

```bash
cd /opt/meaningdiff/deploy
sudo bash deploy.sh meaningdiff.your-domain.com
```

That script:
1. installs Node 22, Caddy, ufw
2. creates a `meaningdiff` service user
3. `npm ci --omit=dev`
4. installs the systemd unit (`meaningdiff.service`) and starts it
5. writes a Caddyfile with auto Let's Encrypt for your domain
6. opens 80 / 443 in ufw and prints next steps

### No domain yet? Just want to peek over IP first

```bash
sudo bash deploy.sh --ip-only
# then edit MEANINGDIFF_HOST to 0.0.0.0 (the script tells you how),
# open ufw 7700/tcp, visit http://143.198.204.73:7700
```
**This is for testing only — no TLS, no auth, anyone with the IP can use it.**

---

## 3. Point Cloudflare at the droplet

1. In Cloudflare DNS, add an **A** record:
   - Name: `meaningdiff` (or whatever subdomain)
   - Content: `143.198.204.73`
   - Proxy: **ON** (orange cloud)
2. SSL/TLS → Overview → set encryption mode to **Full (strict)**
   (Caddy presents a real Let's Encrypt cert on the origin.)
3. Wait 1–5 min, then open `https://meaningdiff.your-domain.com`

Optional next steps:
- Cloudflare → Security → set a basic WAF rule limiting `/diff`, `/certify`,
  `/extract` to a sensible rate (e.g. 30 req/min/IP).
- Uncomment the Cloudflare-IPs allowlist in `Caddyfile` (refresh from
  <https://www.cloudflare.com/ips/>) so the origin only accepts CF traffic.
- Cloudflare Access (Zero Trust, free for ≤50 users) puts a login screen in
  front of the whole site if this isn't meant to be public.

---

## 4. Operating

```bash
sudo systemctl status meaningdiff caddy   # are they running?
sudo journalctl -u meaningdiff -f         # tail meaningdiff logs
sudo systemctl restart meaningdiff        # apply config changes
cd /opt/meaningdiff && sudo git pull && sudo systemctl restart meaningdiff   # update
```

The deterministic mode means **zero external calls** from the server.
Documents arrive at the droplet (this is unavoidable for a hosted demo), get
processed in-memory, and are NOT stored to disk by the app.

---

## 5. Why no LLM here?

| | size |
|---|---|
| droplet RAM | 2 GB |
| gemma3:12b (Q4_K_M) | ~7–11 GB |
| even gemma2:2b on CPU | ~2 GB + very slow on 1 vCPU |

A 12 GB+ RAM droplet (or one with a GPU) is needed for real-time LLM judging.
This deployment intentionally stays deterministic-only so you can ship it cheap
and stand behind every result it returns.
