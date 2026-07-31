# Watiq — Security

**Companion documents:** [`Architecture.md`](./Architecture.md) · [`Backend.md`](./Backend.md) · [`Structure.md`](./Structure.md)

---

## 0. What this document promises — and what it does not

This document targets the achievable goal, which is also the stronger one:

1. **No single failure becomes a breach.** Four independent authorization layers, so a bug in one is caught by the next. This is already real in Watiq: a missing `WHERE user_id = …` is a *performance* bug, because RLS still refuses the rows.
2. **Attacks are expensive, slow, and loud.** Rate limits, WAF, behavioural IPS, and an audit log that records who *looked*, not just who changed.
3. **Compromise is detected in minutes, not months.** IDS, HIDS, file integrity monitoring, anomalous-access detection over `access_log`.
4. **Recovery is tested, not assumed.** PITR with scheduled restore drills.
5. **Unknown vulnerabilities are found and patched fast.** Continuous CVE monitoring with binding SLAs.

§17 states plainly what these controls do **not** stop. That section is the most important one in the file.

---

## 1. Threat model

### 1.1 Assets, by what an attacker gains

| Asset | Where | Impact if lost |
|---|---|---|
| **CIN (national ID) numbers** | `users.national_id` | Nationwide identity fraud. Tunisia's CIN is 8 digits and is *the* identity primitive. |
| **ID document scans** | MinIO, keyed by `documents.storage_key` | Direct forgery material — passports, CIN, birth certificates |
| **Citizen PII** | `users`, `requests.form_data` | Doxxing, targeted fraud, political targeting |
| **Payment references** | `payments.reference_number`, `transaction_id` | Financial fraud. The schema forbids logging these in plaintext. |
| **Staff MFA seeds** | `staff.mfa_secret` | Full impersonation of a civil servant, at that servant's office scope |
| **Service availability** | the platform itself | A national portal offline during a tax deadline is a public-service failure |
| **`access_log` integrity** | `access_log` | Loss of accountability — an insider could not be proven to have looked |

### 1.2 Adversaries

| Actor | Capability | Primary defence |
|---|---|---|
| Opportunistic scanner | Automated CVE/config scanning | WAF, CrowdSec, patch SLA |
| Credential stuffer | Breached password corpora | Argon2id, lockout, rate limits, staff MFA |
| Targeted attacker | Custom exploits, patience | Defence in depth, IDS/HIDS, egress restriction |
| **Malicious insider (clerk)** | Valid credentials, legitimate office scope | **RLS office scoping + `access_log` + anomaly detection** |
| **Compromised operator account** | Host/root access | Bastion, key-only SSH, FIM, offline backups — see §17 |
| Nation-state | 0-days, supply chain, physical | Partially mitigated; honestly out of full scope — §17 |

**The insider is the adversary most systems ignore and the one this schema was clearly designed against.** `access_log` exists to catch "a clerk browsing a neighbour's file" — the schema says so in a comment. §14.3 makes that detection real.

### 1.3 STRIDE

| Threat | Concrete scenario | Control | Layer |
|---|---|---|---|
| **S**poofing | Stolen refresh token replayed | Opaque tokens, rotation, reuse detection revokes the family | App |
| **S**poofing | Forged `X-Forwarded-For` to evade IP rate limits | Trust only the last proxy hop, explicit trusted-proxy list | Edge |
| **T**ampering | Citizen sets own request to `approved` | No `INSERT`/`UPDATE` grant on `status_id`; trigger sets it | DB |
| **T**ampering | Appointment planted in another office's book | `fn_appointments_derive_from_slot()` derives `office_id` from the slot | DB |
| **T**ampering | Overbooking a slot by racing | Row lock + `chk_appointment_slots_not_overbooked` | DB |
| **R**epudiation | Clerk denies viewing a record | `access_log`, `staff_id` pinned to session GUC by RLS `WITH CHECK` | DB |
| **I**nfo disclosure | Missing `WHERE` returns all citizens | RLS policies | DB |
| **I**nfo disclosure | Guessable document URL | Private bucket + 300 s presigned GET + `chk_documents_storage_key_not_url` | App/Storage |
| **I**nfo disclosure | PII in application logs | structlog redaction processor | App |
| **I**nfo disclosure | Tracking-code enumeration | 5 random bytes (2^40) + rate limit + CrowdSec scenario | App/Edge |
| **D**oS | Giant JSONB `form_data` | Per-service JSON Schema + size/depth caps | App |
| **D**oS | Slowloris / connection flood | nftables rate limits, Nginx timeouts | Edge |
| **E**levation | SQL injection into session context | `set_config()` with bind params; Semgrep bans f-string SQL | App |
| **E**levation | App connects as schema owner | Separate `NOLOGIN` bundles + `LOGIN` users; CI test asserts RLS active | DB |

---

## 2. Layer 1 — Host firewall (nftables)

Default deny, both directions. Postgres, Redis, and MinIO are not merely firewalled — they publish no host port at all (see [`Architecture.md` §5](./Architecture.md)). This ruleset is the second line for that.

```nft
#!/usr/sbin/nft -f
# ops/nftables/watiq.nft
flush ruleset

table inet watiq {

    # ---- Blocklist maintained by CrowdSec / fail2ban -----------------------
    set blocklist_v4 { type ipv4_addr; flags timeout, interval; }
    set blocklist_v6 { type ipv6_addr; flags timeout, interval; }

    # ---- Admin sources. Replace with the real bastion prefix. --------------
    set admin_v4 { type ipv4_addr; flags interval; elements = { 10.10.0.0/24 } }

    chain inbound {
        type filter hook input priority filter; policy drop;

        # Conntrack first: cheapest accept, and drop invalid early.
        ct state established,related accept
        ct state invalid drop comment "malformed / out-of-window packets"

        iif lo accept

        # Dropped before anything else evaluates.
        ip  saddr @blocklist_v4 drop
        ip6 saddr @blocklist_v6 drop

        # --- Anti-scan / anti-flood ---------------------------------------
        # Nonsense TCP flag combinations used by nmap and stack fingerprinting.
        tcp flags & (fin|syn|rst|psh|ack|urg) == 0x0            drop comment "null scan"
        tcp flags & (fin|syn|rst|psh|ack|urg) == fin|psh|urg    drop comment "xmas scan"
        tcp flags & (syn|fin) == syn|fin                        drop
        tcp flags & (syn|rst) == syn|rst                        drop

        # SYN flood: 200/s sustained, burst 500, then drop.
        tcp flags syn tcp dport { 80, 443 } \
            limit rate over 200/second burst 500 packets drop

        # Cap concurrent connections per source IP. Slowloris budget.
        tcp dport { 80, 443 } ct count over 100 drop

        # --- ICMP: keep PMTU discovery working, rate-limit the rest --------
        icmp   type { destination-unreachable, time-exceeded, parameter-problem } accept
        icmpv6 type { destination-unreachable, packet-too-big, time-exceeded,
                      parameter-problem, nd-neighbor-solicit, nd-neighbor-advert,
                      nd-router-advert } accept
        icmp   type echo-request limit rate 5/second accept
        icmpv6 type echo-request limit rate 5/second accept

        # --- The only public services -------------------------------------
        tcp dport { 80, 443 } accept

        # --- Administration: bastion only ---------------------------------
        ip saddr @admin_v4 tcp dport 22 ct state new \
            limit rate 4/minute burst 4 packets accept

        # Everything else is logged (sampled) and dropped by policy.
        limit rate 10/minute log prefix "nft-drop-in: " level info
    }

    chain forward {
        type filter hook forward priority filter; policy drop;
        # Docker installs its own forward rules; this table does not manage them.
        ct state established,related accept
    }

    chain outbound {
        type filter hook output priority filter; policy drop;

        ct state established,related accept
        oif lo accept

        # DNS, NTP, and outbound TLS for updates / SMTP / payment gateway.
        udp dport { 53, 123 } accept
        tcp dport 53 accept
        tcp dport { 80, 443 } accept
        tcp dport { 465, 587 } accept comment "SMTP submission"

        # Docker bridge subnets: inter-container traffic.
        ip daddr { 172.16.0.0/12, 10.0.0.0/8 } accept

        limit rate 10/minute log prefix "nft-drop-out: " level info
    }
}
```

Validate before loading — a syntax error with `policy drop` locks you out:

```bash
nft -c -f ops/nftables/watiq.nft && systemctl reload nftables
```

**Egress is restricted deliberately.** Most data exfiltration and most C2 callbacks need outbound connectivity the application never legitimately uses. The `watiq_data` Docker network is declared `internal: true`, so Postgres and Redis have **no route to the internet at all**.

---

## 3. Layer 2 — WAF (Nginx + ModSecurity v3 + OWASP CRS 4)

### 3.1 Nginx

```nginx
# ops/nginx/conf.d/watiq.conf

# Rate limit zones. CrowdSec handles behaviour; these are the blunt caps.
limit_req_zone  $binary_remote_addr zone=general:20m rate=30r/s;
limit_req_zone  $binary_remote_addr zone=login:10m   rate=10r/m;
limit_req_zone  $binary_remote_addr zone=upload:10m  rate=20r/m;
limit_conn_zone $binary_remote_addr zone=perip:10m;

# Trust ONLY the Docker edge network for X-Forwarded-For.
set_real_ip_from 172.20.0.0/16;
real_ip_header   X-Forwarded-For;
real_ip_recursive on;

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    http2 on;
    server_name watiq.tn;

    include snippets/tls.conf;
    include snippets/security-headers.conf;

    modsecurity on;
    modsecurity_rules_file /etc/nginx/modsecurity/modsecurity.conf;

    # Do not advertise the version. Minor, but free.
    server_tokens off;

    client_max_body_size 12m;          # > max_upload_bytes (10m), < absurd
    client_body_timeout  10s;
    client_header_timeout 10s;
    send_timeout         30s;
    keepalive_timeout    30s;

    limit_conn perip 50;
    limit_req  zone=general burst=60 nodelay;
    limit_req_status 429;

    # Only the verbs the API actually uses.
    if ($request_method !~ ^(GET|HEAD|POST|PATCH|PUT|DELETE|OPTIONS)$) {
        return 405;
    }

    location / {
        proxy_pass http://watiq-api:8000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID      $request_id;

        proxy_connect_timeout 5s;
        proxy_send_timeout    30s;
        proxy_read_timeout    30s;

        proxy_buffering on;
        proxy_buffers 16 8k;
    }

    location = /api/v1/auth/login {
        limit_req zone=login burst=5 nodelay;
        proxy_pass http://watiq-api:8000;
        include snippets/proxy-common.conf;
    }

    location ~ ^/api/v1/(requests/[0-9]+/documents|documents) {
        limit_req zone=upload burst=10 nodelay;
        proxy_pass http://watiq-api:8000;
        include snippets/proxy-common.conf;
    }

    # Internal-only endpoints must never be reachable from outside.
    location ~ ^/(healthz|readyz|metrics)$ { deny all; return 404; }

    # No interactive API docs in production.
    location ~ ^/(docs|redoc|openapi.json)$ { deny all; return 404; }
}
```

### 3.2 TLS

```nginx
# ops/nginx/snippets/tls.conf
ssl_certificate     /etc/nginx/certs/watiq.crt;
ssl_certificate_key /etc/nginx/certs/watiq.key;

ssl_protocols TLSv1.3 TLSv1.2;      # 1.2 retained only for older gov clients
ssl_prefer_server_ciphers off;      # TLS 1.3: let the client choose
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
ssl_ecdh_curve X25519:secp384r1;

ssl_session_cache shared:SSL:20m;
ssl_session_timeout 1d;
ssl_session_tickets off;            # session tickets weaken forward secrecy

ssl_stapling on;
ssl_stapling_verify on;
ssl_trusted_certificate /etc/nginx/certs/chain.pem;
resolver 127.0.0.11 valid=300s;
```

### 3.3 Security headers

```nginx
# ops/nginx/snippets/security-headers.conf
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

# Single-origin SPA. No inline script, no external origins, no framing.
add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; upgrade-insecure-requests" always;

add_header X-Content-Type-Options    "nosniff" always;
add_header X-Frame-Options           "DENY" always;
add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
add_header Permissions-Policy        "geolocation=(self), camera=(), microphone=(), payment=(), usb=()" always;
add_header Cross-Origin-Opener-Policy   "same-origin" always;
add_header Cross-Origin-Embedder-Policy "require-corp" always;
add_header Cross-Origin-Resource-Policy "same-origin" always;
add_header Cache-Control "no-store" always;   # API responses; static assets override
```

`frame-ancestors 'none'` plus `X-Frame-Options: DENY` kills clickjacking. `script-src 'self'` with **no** `'unsafe-inline'` is the single most effective XSS control, and it is affordable here because the SPA is bundled — geolocation is retained because "nearest office that does X" needs it.

### 3.4 ModSecurity + CRS 4

```apache
# ops/modsecurity/modsecurity.conf
SecRuleEngine On
SecRequestBodyAccess On
SecRequestBodyLimit 13107200
SecRequestBodyNoFilesLimit 262144
SecRequestBodyLimitAction Reject

SecResponseBodyAccess Off              # no need; avoids buffering large downloads

SecArgumentSeparator &
SecCookieFormat 0
SecUnicodeMapFile unicode.mapping 20127
SecTmpDir /tmp/modsecurity
SecDataDir /tmp/modsecurity

SecAuditEngine RelevantOnly
SecAuditLogRelevantStatus "^(?:5|4(?!04))"
SecAuditLogParts ABIJDEFHZ
SecAuditLogType Serial
SecAuditLog /var/log/modsec_audit.log

# Parse JSON bodies so CRS inspects them properly (this API is JSON-first).
SecRule REQUEST_HEADERS:Content-Type "^application/json" \
    "id:200001,phase:1,pass,t:none,t:lowercase,nolog,ctl:requestBodyProcessor=JSON"

Include /etc/nginx/modsecurity/crs-setup.conf
Include /etc/nginx/modsecurity/rules/*.conf
Include /etc/nginx/modsecurity/crs/rules/*.conf
```

```apache
# ops/modsecurity/crs-setup.conf  (excerpt)
SecAction "id:900000,phase:1,nolog,pass,t:none,setvar:tx.blocking_paranoia_level=2"
SecAction "id:900001,phase:1,nolog,pass,t:none,setvar:tx.detection_paranoia_level=3"

# Block at 5 inbound / 4 outbound anomaly points (CRS defaults).
SecAction "id:900110,phase:1,nolog,pass,t:none,\
  setvar:tx.inbound_anomaly_score_threshold=5,\
  setvar:tx.outbound_anomaly_score_threshold=4"

SecAction "id:900200,phase:1,nolog,pass,t:none,\
  setvar:'tx.allowed_methods=GET HEAD POST PATCH PUT DELETE OPTIONS'"

SecAction "id:900220,phase:1,nolog,pass,t:none,\
  setvar:'tx.allowed_request_content_type=application/json|application/x-www-form-urlencoded|multipart/form-data'"
```

**Paranoia level 2 blocking, level 3 detecting.** PL3+ blocking on a portal carrying Arabic and French free text produces a false-positive rate that gets the WAF disabled by an exhausted operator — which is worse than PL2. Run PL3 in detection for a month, review the log, then promote what is clean.

### 3.5 The false positives that will actually happen

This is the realistic tuning burden for *this* application, and skipping it is why WAFs get switched off:

```apache
# ops/modsecurity/rules/00-watiq-exclusions.conf

# --- 1. Arabic / French UTF-8 -------------------------------------------
# service_catalog names are Arabic ('شهادة ولادة') and French with accents
# ('Extrait d'acte de décès'). CRS byte-range and encoding rules flag both.
SecRule REQUEST_URI "@beginsWith /api/v1/services" \
    "id:1000,phase:1,pass,nolog,t:none,\
     ctl:ruleRemoveById=920272,\
     ctl:ruleRemoveById=920273,\
     ctl:ruleRemoveById=920274"

# --- 2. Apostrophes in French text --------------------------------------
# "Certificat d'hébergement" trips SQLi heuristics on the apostrophe.
# Narrowly scoped to the free-text fields that legitimately contain them.
SecRule REQUEST_URI "@rx ^/api/v1/(requests|appointments)" \
    "id:1001,phase:2,pass,nolog,t:none,\
     ctl:ruleRemoveTargetById=942100;ARGS:reason,\
     ctl:ruleRemoveTargetById=942100;ARGS:notes,\
     ctl:ruleRemoveTargetById=942190;ARGS:reason"

# --- 3. form_data JSONB ---------------------------------------------------
# Arbitrary nested JSON with citizen names/addresses. CRS cannot usefully
# reason about it, and the app validates it against a per-service JSON Schema
# (see §8.2), which is a STRONGER control than a regex.
SecRule REQUEST_URI "@rx ^/api/v1/requests" \
    "id:1002,phase:2,pass,nolog,t:none,\
     ctl:ruleRemoveTargetByTag=attack-sqli;ARGS:json.form_data,\
     ctl:ruleRemoveTargetByTag=attack-xss;ARGS:json.form_data"

# --- 4. Base64 document checksums / presigned URL params ----------------
SecRule REQUEST_URI "@beginsWith /api/v1/documents" \
    "id:1003,phase:2,pass,nolog,t:none,\
     ctl:ruleRemoveTargetById=920273;ARGS:checksum_sha256"
```

> Each exclusion is **narrowly scoped to one route and one parameter**, and each states which compensating control replaces it. A blanket `SecRuleRemoveById` is how a WAF becomes theatre.

```apache
# ops/modsecurity/rules/99-watiq-custom.conf

# Tracking codes are WTQ-YYYY-XXXXXXXXXX. Anything else on this route is
# probing, so fail it before it reaches the app.
SecRule REQUEST_URI "@rx ^/api/v1/requests/track/(.*)$" \
    "id:1100,phase:1,deny,status:400,log,\
     msg:'Malformed tracking code',chain"
    SecRule TX:1 "!@rx ^WTQ-20[0-9]{2}-[0-9A-F]{10}$" "t:none"

# CIN must be exactly 8 digits. Reject anything else at the edge.
SecRule ARGS:national_id "!@rx ^[0-9]{8}$" \
    "id:1101,phase:2,deny,status:400,log,msg:'Malformed national_id'"

# Nobody legitimately requests these.
SecRule REQUEST_URI "@rx (?i)/(\.git|\.env|wp-admin|phpmyadmin|\.aws|\.ssh|actuator|_profiler)" \
    "id:1102,phase:1,deny,status:404,log,msg:'Scanner path probe',\
     setvar:ip.scanner_score=+1,expirevar:ip.scanner_score=300"
```

---

## 4. Layer 3 — IPS (CrowdSec)

The WAF blocks *requests*; CrowdSec blocks *actors*. It reads Nginx and application logs, detects behaviour over time, and pushes decisions to the Nginx bouncer and to the nftables sets in §2.

```yaml
# ops/crowdsec/acquis.yaml
filenames:
  - /var/log/nginx/access.log
  - /var/log/nginx/error.log
labels:
  type: nginx
---
filenames:
  - /var/log/modsec_audit.log
labels:
  type: modsecurity
---
filenames:
  - /var/log/watiq/app.json
labels:
  type: watiq-api
```

```yaml
# ops/crowdsec/scenarios/watiq.yaml
type: leaky
name: watiq/login-bruteforce
description: "Repeated failed logins from one IP"
filter: "evt.Meta.log_type == 'watiq_auth_failure'"
leakspeed: "10s"
capacity: 10
groupby: "evt.Meta.source_ip"
blackhole: 5m
labels:
  remediation: true
  behavior: "http:bruteforce"
  confidence: 3
---
type: leaky
name: watiq/credential-stuffing
description: "Failed logins across MANY distinct accounts from one IP"
filter: "evt.Meta.log_type == 'watiq_auth_failure'"
distinct: "evt.Meta.target_account"
leakspeed: "60s"
capacity: 5
groupby: "evt.Meta.source_ip"
labels:
  remediation: true
  behavior: "http:bruteforce"
  confidence: 3
---
type: leaky
name: watiq/tracking-code-enumeration
description: "Sweeping /requests/track/ with codes that do not exist"
filter: "evt.Parsed.request matches '/api/v1/requests/track/' && evt.Meta.http_status == '404'"
leakspeed: "5s"
capacity: 15
groupby: "evt.Meta.source_ip"
labels:
  remediation: true
  behavior: "http:enumeration"
---
type: leaky
name: watiq/slot-hoarding
description: "Booking then cancelling appointments to deny others capacity"
filter: "evt.Meta.log_type == 'watiq_appointment_cancelled'"
leakspeed: "300s"
capacity: 10
groupby: "evt.Meta.principal_id"
labels:
  remediation: true
---
type: trigger
name: watiq/modsec-critical
description: "A single critical ModSecurity hit"
filter: "evt.Meta.log_type == 'modsecurity' && evt.Meta.severity == 'CRITICAL'"
groupby: "evt.Meta.source_ip"
labels:
  remediation: true
  confidence: 3
```

```yaml
# ops/crowdsec/profiles.yaml
name: watiq_escalating_ban
filters:
  - Alert.Remediation == true && Alert.GetScenario() == "watiq/credential-stuffing"
decisions:
  - type: ban
    duration: 24h
on_success: break
---
name: watiq_standard_ban
filters:
  - Alert.Remediation == true
decisions:
  - type: ban
    duration: 4h
notifications:
  - slack_security
on_success: break
```

Credential stuffing gets 24 hours because it is unambiguous — a single IP failing against many *different* accounts has no legitimate explanation. Ordinary brute force gets 4 hours, because a citizen on shared CGNAT genuinely can fail ten logins.

**IP-only blocking is not enough**, so `watiq/slot-hoarding` groups by `principal_id`, not IP. An authenticated abuser rotating through a residential proxy pool is invisible to IP-based defence.

---

## 5. Layer 4 — IDS (Suricata)

Suricata inspects ingress traffic that never reaches Nginx (port scans, protocol abuse, malformed TLS) and provides an independent record when the application layer is compromised.

```yaml
# ops/suricata/suricata.yaml  (excerpt)
vars:
  address-groups:
    HOME_NET: "[10.0.0.0/8,172.16.0.0/12,192.168.0.0/16]"
    EXTERNAL_NET: "!$HOME_NET"
    HTTP_SERVERS: "$HOME_NET"
  port-groups:
    HTTP_PORTS: "80,8000"

af-packet:
  - interface: eth0
    cluster-id: 99
    cluster-type: cluster_flow
    defrag: yes
    use-mmap: yes
    tpacket-v3: yes

outputs:
  - eve-log:
      enabled: yes
      filetype: regular
      filename: /var/log/suricata/eve.json
      types:
        - alert: { payload: yes, payload-printable: yes, http-body: yes, metadata: yes }
        - http:  { extended: yes }
        - tls:   { extended: yes }
        - dns
        - flow
        - anomaly

app-layer:
  protocols:
    tls:
      enabled: yes
      ja3-fingerprints: yes     # fingerprints scanner/bot TLS stacks

detect:
  profile: medium
```

Runs in **IDS (detection) mode**, not IPS. Inline blocking on the only ingress path to a national portal risks a false positive taking the service offline; CrowdSec already provides the actuation, informed by Suricata's alerts.

```
# ops/suricata/rules/watiq.rules

# Postgres/Redis/MinIO must NEVER be reachable from outside. If this fires,
# the network topology has been breached — page immediately.
alert tcp $EXTERNAL_NET any -> $HOME_NET 5432 (msg:"WATIQ CRITICAL Postgres from external"; \
  flow:to_server; classtype:policy-violation; priority:1; sid:9000001; rev:1;)
alert tcp $EXTERNAL_NET any -> $HOME_NET 6379 (msg:"WATIQ CRITICAL Redis from external"; \
  flow:to_server; classtype:policy-violation; priority:1; sid:9000002; rev:1;)
alert tcp $EXTERNAL_NET any -> $HOME_NET 9000 (msg:"WATIQ CRITICAL MinIO from external"; \
  flow:to_server; classtype:policy-violation; priority:1; sid:9000003; rev:1;)

# Egress from the data tier is impossible by design. If seen, assume compromise.
alert ip $HOME_NET any -> $EXTERNAL_NET any (msg:"WATIQ CRITICAL Data-tier egress"; \
  flow:to_server; classtype:trojan-activity; priority:1; sid:9000010; rev:1;)

# 8-digit CIN sequences leaving in bulk in a response body.
alert http $HOME_NET any -> $EXTERNAL_NET any (msg:"WATIQ Possible bulk CIN exfiltration"; \
  flow:established,to_client; file_data; \
  pcre:"/\b\d{8}\b(?:[^\d]{1,40}\b\d{8}\b){49,}/"; \
  classtype:data-loss; priority:1; sid:9000020; rev:1;)

# Known scanner TLS fingerprints (JA3).
alert tls $EXTERNAL_NET any -> $HOME_NET any (msg:"WATIQ Scanner JA3"; \
  ja3.hash; content:"e7d705a3286e19ea42f587b344ee6865"; \
  classtype:attempted-recon; priority:2; sid:9000030; rev:1;)
```

Plus the **Emerging Threats Open** ruleset, updated daily by `suricata-update`. Validate config before reload: `suricata -T -c ops/suricata/suricata.yaml -v`.

---

## 6. Layer 5 — HIDS / FIM (Wazuh)

IDS watches the network; Wazuh watches the host. It is what detects a webshell, a modified binary, or a container escape.

```xml
<!-- ops/wazuh/ossec.conf (excerpt) -->
<syscheck>
  <frequency>3600</frequency>
  <alert_new_files>yes</alert_new_files>

  <!-- Application code must never change at runtime. It is a read-only
       container image; any modification means arbitrary code execution. -->
  <directories check_all="yes" realtime="yes" report_changes="yes">/opt/watiq/app</directories>
  <directories check_all="yes" realtime="yes">/opt/watiq/ops</directories>
  <directories check_all="yes" realtime="yes">/etc/nginx,/etc/nftables.conf</directories>
  <directories check_all="yes" realtime="yes">/etc/ssh,/etc/pam.d,/etc/sudoers.d</directories>
  <directories check_all="yes">/bin,/sbin,/usr/bin,/usr/sbin</directories>

  <ignore type="sregex">^/opt/watiq/app/.*\.pyc$</ignore>
  <ignore>/var/log</ignore>
</syscheck>

<rootcheck>
  <frequency>7200</frequency>
  <check_files>yes</check_files>
  <check_trojans>yes</check_trojans>
  <check_pids>yes</check_pids>
  <check_ports>yes</check_ports>
</rootcheck>

<localfile>
  <log_format>json</log_format>
  <location>/var/log/suricata/eve.json</location>
</localfile>
<localfile>
  <log_format>json</log_format>
  <location>/var/log/watiq/app.json</location>
</localfile>
<localfile>
  <log_format>audit</log_format>
  <location>/var/log/audit/audit.log</location>
</localfile>
```

```
# /etc/audit/rules.d/watiq.rules
-w /opt/watiq/app     -p wa -k watiq_code_change
-w /run/secrets       -p r  -k watiq_secret_read
-w /etc/shadow        -p wa -k identity_change
-w /var/run/docker.sock -p rwa -k docker_socket   # the classic escape path
-a always,exit -F arch=b64 -S execve -F euid=0 -k root_exec
-a always,exit -F arch=b64 -S ptrace -k process_injection
```

```xml
<!-- ops/wazuh/rules/watiq_rules.xml -->
<group name="watiq,">
  <rule id="100100" level="14">
    <if_sid>550,554</if_sid>
    <field name="file">/opt/watiq/app/</field>
    <description>WATIQ CRITICAL: application code modified at runtime</description>
    <mitre><id>T1505.003</id></mitre>
  </rule>

  <rule id="100101" level="13">
    <if_group>audit</if_group>
    <field name="audit.key">watiq_secret_read</field>
    <description>WATIQ: secret material read outside container start</description>
  </rule>

  <rule id="100102" level="15">
    <if_group>audit</if_group>
    <field name="audit.key">docker_socket</field>
    <description>WATIQ CRITICAL: Docker socket accessed — container escape attempt</description>
    <mitre><id>T1610</id></mitre>
  </rule>
</group>
```

---

## 7. OWASP mappings

### 7.1 OWASP Top 10 (2021)

| # | Risk | Control in Watiq | Where |
|---|---|---|---|
| **A01** | Broken Access Control | Four independent layers: WAF → `require_permission()` → column GRANTs → RLS policies. IDOR is structurally prevented: a citizen requesting another's `request_id` gets 404 because RLS returns no row | `Watiq.sql` §7/§7b; `core/deps.py` |
| **A02** | Cryptographic Failures | Argon2id passwords; SHA-256 refresh-token hashes; AES-256-GCM for `mfa_secret`; TLS 1.3; Postgres TLS; MinIO SSE; no secret in any response model | `core/security.py`, `core/crypto.py` |
| **A03** | Injection | Parameterized SQL only; `set_config()` bind params for session identity; Semgrep bans f-string SQL; `extra="forbid"` on inputs; CSP blocks XSS execution; no shell invocation anywhere | §8, §9 |
| **A04** | Insecure Design | Threat model (§1); the schema encodes design-level invariants as constraints and triggers rather than trusting app code | This document, `Watiq.sql` |
| **A05** | Security Misconfiguration | `debug` forbidden in prod by a validator; `/docs` and `/metrics` 404 externally; `server_tokens off`; read-only rootless containers; datastores publish no host port | `core/config.py`, §12.3 |
| **A06** | Vulnerable Components | Hash-pinned lockfile; `pip-audit` + Trivy in CI **and** nightly; SBOM; KEV monitoring; patch SLA | §12 |
| **A07** | Identification & Auth Failures | Argon2id; lockout via `locked_until`; staff TOTP MFA; opaque rotating refresh tokens with reuse detection; identical responses for wrong-password vs locked vs unknown account | [`Backend.md` §6](./Backend.md) |
| **A08** | Software & Data Integrity | Signed images, digest-pinned bases; `checksum_sha256` on documents; Wazuh FIM; append-only `access_log` | §6, §12 |
| **A09** | Logging & Monitoring Failures | structlog JSON → Loki; `access_log` records **reads**, not just writes; Suricata/Wazuh/CrowdSec correlated; alerting rules in §14 | §14 |
| **A10** | SSRF | No user-supplied URL is ever fetched. Egress restricted by nftables; `watiq_data` network has no internet route; `chk_documents_storage_key_not_url` forbids URLs where a key belongs | §2 |

### 7.2 OWASP API Security Top 10 (2023) — the more relevant list

| # | Risk | Control | Where |
|---|---|---|---|
| **API1** | Broken Object Level Authorization (BOLA) | See §7.3 — the deepest control in the system | `Watiq.sql` §7 |
| **API2** | Broken Authentication | 15-min EdDSA access tokens; opaque rotating refresh with reuse detection; staff MFA; `__Host-` cookie | [`Backend.md` §6](./Backend.md) |
| **API3** | Broken Object Property Level Authorization | **Column-level GRANTs** — a citizen cannot write `status_id` even with a perfect exploit of the service layer. Response models are explicit allow-lists; `storage_key`, `password_hash`, `mfa_secret` are in no `*Out` model | `Watiq.sql` §7b |
| **API4** | Unrestricted Resource Consumption | Tiered rate limits; `client_max_body_size`; `form_data` size/depth caps; `statement_timeout=5s`; cursor pagination with a max page size; ARQ concurrency caps | §8, [`Backend.md` §5.6](./Backend.md) |
| **API5** | Broken Function Level Authorization | `require_permission()` on every staff route, backed by `fn_staff_has_permission()` inside RLS. An admin route reached by a clerk fails **twice** | `core/deps.py` |
| **API6** | Unrestricted Access to Sensitive Business Flows | Slot-hoarding scenario in CrowdSec; per-user booking and upload limits; `uq_appointments_user_slot` blocks double-booking at the DB | §4 |
| **API7** | SSRF | No outbound fetch of user input; egress allow-list | §2 |
| **API8** | Security Misconfiguration | §12.3, plus CI checks in [`Structure.md` §8](./Structure.md) | §12 |
| **API9** | Improper Inventory Management | Versioned `/api/v1`; OpenAPI exported and diffed in CI; no undocumented endpoint ships; staging carries **no** production data | [`Structure.md` §8](./Structure.md) |
| **API10** | Unsafe Consumption of Third-Party APIs | Payment gateway responses validated against a strict schema; timeouts + circuit breaker; gateway callbacks verified by HMAC signature, never trusted on shape alone | §13 |

### 7.3 API1/BOLA in depth

BOLA is the single most exploited API flaw, and it is where Watiq's design pays off most.

`GET /api/v1/requests/8821` where request 8821 belongs to another citizen:

1. **Layer 2** — the service calls `requests_repo.get(conn, 8821)`. No ownership check is even required for correctness here.
2. **Layer 4** — the query runs on the `watiq_citizen` connection with `app.current_user_id = 4412`. The policy `requests_owner_select … USING (user_id = app_current_user_id())` evaluates false. **Zero rows.**
3. The service sees `None` and raises `NotFound` → **404**.

404, not 403 — a 403 would confirm the record exists, which is an enumeration oracle.

The same holds for documents (`documents_owner_select` joins through `requests`), payments, appointments, and notifications. And for staff: a Sfax clerk querying a Tunis request gets nothing, because `requests_staff_office` requires `office_id = app_current_office_id()`.

**What still needs application care:**

- `tracking_code` lookup is deliberately unauthenticated (citizens track without logging in). Mitigations: 5 random bytes = 2^40 space, per-IP rate limit, the CrowdSec enumeration scenario, the ModSecurity format rule, and a response exposing only status and dates — never PII.
- Aggregate views (`v_office_workload`) join across offices. They are `security_invoker`, so RLS still applies to the caller — verified by a test in `tests/security/`.

---

## 8. Application-layer input controls

### 8.1 Strict Pydantic

```python
# app/modules/requests/schemas.py
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

NationalId = Annotated[str, StringConstraints(pattern=r"^[0-9]{8}$")]
TunisianPhone = Annotated[str, StringConstraints(pattern=r"^\+216[0-9]{8}$")]


class StrictModel(BaseModel):
    # extra="forbid" is a SECURITY control, not tidiness: it defeats mass
    # assignment. A client sending {"status_id": 8} gets 422, not a silent drop.
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True,
                              frozen=True, validate_assignment=True)


class RequestCreateIn(StrictModel):
    office_service_id: int = Field(gt=0)
    office_id: int = Field(gt=0)
    priority_id: int | None = Field(default=None, gt=0)
    form_data: dict = Field(default_factory=dict)
    # DELIBERATELY ABSENT: status_id, tracking_code, assigned_staff_id,
    # submitted_at, completed_at. All are trigger- or staff-owned. The schema
    # withholds the grants; this schema withholds the field. Both, on purpose.
```

Patterns mirror the schema's own `CHECK` constraints (`chk_users_national_id_format`, `chk_users_phone_format`) so validation fails at the boundary with a clear 422 rather than as a database error.

### 8.2 `form_data` — the one place the schema cannot help

`requests.form_data` is `JSONB NOT NULL DEFAULT '{}'`. Postgres will accept a 40 MB, 10 000-deep nested object. That is a storage-abuse and parser-DoS vector, and it can smuggle content into staff-facing UIs.

```python
# app/modules/requests/formdata.py
import json
from functools import lru_cache
from pathlib import Path

from jsonschema import Draft202012Validator, ValidationError

from app.core.errors import UnprocessableEntity

MAX_SERIALIZED_BYTES = 64 * 1024
MAX_DEPTH = 8
MAX_KEYS = 200
MAX_STRING_LEN = 4096

_SCHEMA_DIR = Path(__file__).parent / "formschemas"


@lru_cache(maxsize=256)
def _validator_for(service_code: str) -> Draft202012Validator:
    path = _SCHEMA_DIR / f"{service_code}.json"
    if not path.is_file():
        raise UnprocessableEntity(f"no form schema for service {service_code}")
    schema = json.loads(path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def _structural_limits(obj, depth: int = 0) -> int:
    """Bound depth, key count and string length BEFORE schema validation.

    Order matters: a hostile 10k-deep object must be rejected by these cheap
    checks, not by a validator that will recurse into it.
    """
    if depth > MAX_DEPTH:
        raise UnprocessableEntity("form_data nested too deeply")
    count = 0
    if isinstance(obj, dict):
        count += len(obj)
        for k, v in obj.items():
            if len(k) > 128:
                raise UnprocessableEntity("form_data key too long")
            count += _structural_limits(v, depth + 1)
    elif isinstance(obj, list):
        if len(obj) > 100:
            raise UnprocessableEntity("form_data array too long")
        for v in obj:
            count += _structural_limits(v, depth + 1)
    elif isinstance(obj, str) and len(obj) > MAX_STRING_LEN:
        raise UnprocessableEntity("form_data string too long")
    if count > MAX_KEYS:
        raise UnprocessableEntity("form_data has too many fields")
    return count


def validate_form_data(service_code: str, data: dict) -> dict:
    if len(json.dumps(data).encode()) > MAX_SERIALIZED_BYTES:
        raise UnprocessableEntity("form_data too large")
    _structural_limits(data)
    try:
        _validator_for(service_code).validate(data)
    except ValidationError as e:
        raise UnprocessableEntity(f"form_data invalid: {e.json_path}: {e.message}")
    return data
```

A schema per `service_catalog.code`, `additionalProperties: false`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "civil.birth_certificate",
  "type": "object",
  "additionalProperties": false,
  "required": ["subject_national_id", "copies"],
  "properties": {
    "subject_national_id": { "type": "string", "pattern": "^[0-9]{8}$" },
    "subject_full_name":   { "type": "string", "maxLength": 200 },
    "birth_municipality":  { "type": "string", "maxLength": 100 },
    "copies":              { "type": "integer", "minimum": 1, "maximum": 5 },
    "language":            { "type": "string", "enum": ["ar", "fr"] }
  }
}
```

This is also the compensating control for the ModSecurity exclusion in §3.5 rule 1002 — an allow-list schema is strictly stronger than CRS regexes over arbitrary JSON.

### 8.3 File uploads

| Check | How | Why |
|---|---|---|
| Size | Presigned PUT `content-length-range`; `client_max_body_size 12m` | Storage exhaustion |
| Type | **Magic bytes** via `python-magic`, cross-checked against `mime_type` | Extensions lie; `.pdf` is not a PDF |
| Allow-list | `application/pdf`, `image/jpeg`, `image/png` only | Deny-lists are always incomplete |
| Malware | ClamAV in the ARQ job, before staff can open it | Staff workstations are the target |
| Integrity | `checksum_sha256` verified server-side | Tamper and duplicate detection |
| Metadata | EXIF stripped from images | GPS coordinates in a CIN photo are a location leak |
| Naming | Server-generated key `requests/{yyyy}/{mm}/{uuid4}.{ext}` | Path traversal, collisions, and enumeration all die here |
| Serving | Private bucket + 300 s presigned GET after authz + `access_log` write | `chk_documents_storage_key_not_url` enforces the key/URL distinction |

**Uploads are never served from a domain that can execute them,** and MinIO returns `Content-Disposition: attachment` with `X-Content-Type-Options: nosniff`.

### 8.4 CSRF

The refresh cookie is `SameSite=Strict`, which stops the classic cross-site POST. Defence in depth adds a double-submit token on the refresh endpoint, plus a strict `Origin` check:

```python
# app/core/security.py
import hmac, secrets

def issue_csrf_token() -> str:
    return secrets.token_urlsafe(32)

def verify_csrf(header_token: str | None, cookie_token: str | None) -> bool:
    if not header_token or not cookie_token:
        return False
    return hmac.compare_digest(header_token, cookie_token)   # constant time
```

```python
# app/core/middleware.py — Origin check on every state-changing request
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}

async def origin_guard(request: Request, call_next):
    if request.method in UNSAFE:
        origin = request.headers.get("origin")
        if origin and origin not in get_settings().cors_origins:
            return problem(request, 403, "bad_origin", "Origin not allowed.")
    return await call_next(request)
```

CORS is a strict allow-list — never `allow_origins=["*"]`, which is incompatible with credentialed requests anyway.

---

## 9. Injection defence

### 9.1 The one genuinely dangerous line in an RLS application

`SET LOCAL app.current_user_id = '123'` cannot be parameterized. Written naively:

```python
# NEVER. This is total authorization bypass, not just data disclosure.
await conn.execute(text(f"SET LOCAL app.current_user_id = '{user_id}'"))
```

A `user_id` of `1'; SET app.current_office_id = '99` rewrites the attacker's own office scope. Every RLS policy in the schema then evaluates correctly — against forged identity.

The fix is `set_config()`, which is a normal function call and takes bind parameters ([`Backend.md` §4.2](./Backend.md)). Enforced by CI:

```yaml
# ops/semgrep/watiq.yml
rules:
  - id: no-fstring-sql
    languages: [python]
    severity: ERROR
    message: >
      Never build SQL with f-strings or concatenation. Use bind parameters.
      For session context use: SELECT set_config('app.current_user_id', :uid, true)
    patterns:
      - pattern-either:
          - pattern: sqlalchemy.text(f"...")
          - pattern: text(f"...")
          - pattern: $CONN.execute(f"...")
          - pattern: text("..." + $X)
          - pattern: text("..." % $X)
          - pattern: text("...".format(...))

  - id: no-set-local-interpolation
    languages: [python]
    severity: ERROR
    message: "SET LOCAL cannot be parameterized. Use set_config(name, :value, true)."
    pattern-regex: "SET\\s+LOCAL\\s+app\\."

  - id: no-owner-connection
    languages: [python]
    severity: ERROR
    message: "RLS does not apply to the schema owner. Never connect as it at runtime."
    pattern-regex: "(watiq_migrate|postgres)@"
```

### 9.2 Everything else

- **SQL** — SQLAlchemy Core/`text()` with bind parameters, exclusively. No ORM string filters built from user input. `statement_timeout = 5s` bounds any query that slips through.
- **XSS** — the API returns JSON with `Content-Type: application/json`; `nosniff` prevents HTML interpretation; CSP has no `'unsafe-inline'`. Stored XSS via `form_data` reaching a staff UI is blocked by the §8.2 allow-list plus SPA-side escaping.
- **Command injection** — no `subprocess`, no `os.system`, no shell anywhere in the codebase. ClamAV is reached over its TCP socket protocol, not by invoking `clamscan`.
- **Path traversal** — object keys are server-generated UUIDs; no user string ever reaches a filesystem or object path.
- **Template injection** — notification templates are static files with parameter substitution; user input is never part of a template string.
- **Deserialization** — JSON only, via `orjson`. **No `pickle` anywhere**, including ARQ job payloads (ARQ is configured with a JSON serializer).
- **XXE** — no XML parsing in the request path.
- **Header injection** — FastAPI/Starlette reject CR/LF in header values; `X-Forwarded-For` is trusted from the last proxy hop only.

---

## 10. Datastore hardening

### 10.1 PostgreSQL

```conf
# ops/postgres/postgresql.conf (excerpt)
listen_addresses = '*'            # container-internal network only; no host port

ssl = on
ssl_cert_file = '/etc/postgresql/certs/server.crt'
ssl_key_file  = '/etc/postgresql/certs/server.key'
ssl_min_protocol_version = 'TLSv1.3'

password_encryption = 'scram-sha-256'

# Bound runaway and hostile queries.
statement_timeout = '5s'
idle_in_transaction_session_timeout = '10s'
lock_timeout = '3s'

log_destination = 'jsonlog'
logging_collector = on
log_connections = on
log_disconnections = on
log_statement = 'ddl'             # never 'all' — it would log bound PII
log_min_duration_statement = 1000
log_line_prefix = '%m [%p] %q%u@%d app=%a '

shared_preload_libraries = 'pgaudit,pg_stat_statements'
pgaudit.log = 'role,ddl'          # privilege and schema changes
pgaudit.log_catalog = off
pgaudit.log_parameter = off       # CRITICAL: parameters contain CIN numbers
```

```conf
# ops/postgres/pg_hba.conf
# TYPE  DATABASE  USER                 ADDRESS        METHOD
hostssl watiq     watiq_app_citizen    172.21.0.0/16  scram-sha-256
hostssl watiq     watiq_app_staff      172.21.0.0/16  scram-sha-256
hostssl watiq     watiq_app_auth       172.21.0.0/16  scram-sha-256
hostssl watiq     watiq_app_auditor    172.21.0.0/16  scram-sha-256
hostssl watiq     watiq_app_admin      172.21.0.0/16  scram-sha-256
hostssl watiq     watiq_migrate        172.21.0.0/16  scram-sha-256
local   all       all                                 reject
host    all       all                  0.0.0.0/0      reject
```

Non-negotiables:

1. **The application never connects as the schema owner or a superuser.** RLS does not apply to them — every policy silently becomes inert. This is the single highest-impact misconfiguration possible in this system, and §16.1 tests for it.
2. `pgaudit.log_parameter = off`. With it on, every bound CIN number lands in the Postgres log.
3. `log_statement = 'ddl'`, never `'all'`, for the same reason.
4. Per-role `CONNECTION LIMIT` ([`Structure.md` §7.1](./Structure.md)) so one pool cannot starve the others.
5. `REVOKE ALL ON SCHEMA public FROM PUBLIC` — Postgres 15 does this by default; verify it held.

### 10.2 Redis

```conf
# ops/redis/redis.conf
bind 0.0.0.0
protected-mode yes
port 0                                  # plaintext port DISABLED
tls-port 6379
tls-cert-file /tls/redis.crt
tls-key-file  /tls/redis.key
tls-ca-cert-file /tls/ca.crt
tls-auth-clients yes                    # mutual TLS

aclfile /etc/redis/users.acl

maxmemory 2gb
maxmemory-policy allkeys-lru            # cache only; eviction is acceptable

# Commands with no legitimate use here.
rename-command FLUSHALL ""
rename-command FLUSHDB  ""
rename-command CONFIG   ""
rename-command DEBUG    ""
rename-command SHUTDOWN ""
rename-command KEYS     ""              # O(N) blocking scan = trivial DoS
rename-command MODULE   ""

appendonly no                           # nothing here needs to survive a restart
save ""
```

```
# ops/redis/users.acl
user default off

# API: cache + rate limits + locks. No admin verbs, no cross-namespace access.
user watiq_api on >__FROM_SECRET__ ~wtq:* &* \
  +@read +@write +@string +@hash +@set +@sortedset +@scripting \
  -@dangerous -@admin -flushall -flushdb -keys -config

# Worker: additionally owns the ARQ queues.
user watiq_worker on >__FROM_SECRET__ ~wtq:* ~arq:* &* \
  +@read +@write +@list +@string +@scripting -@dangerous -@admin

user watiq_metrics on >__FROM_SECRET__ ~* +info +ping +client|info
```

**Redis holds no PII by policy** ([`Backend.md` §5.1](./Backend.md)), so compromise costs cache poisoning and rate-limit bypass — serious, but not a citizen-data breach. That property is worth protecting: `tests/security/test_no_pii_in_cache.py` asserts it (§16.3).

### 10.3 MinIO

- Buckets private; **anonymous access policy explicitly denied** (a public bucket is the most common cloud-storage breach).
- Server-side encryption (SSE-KMS) at rest.
- Versioning + object lock in governance mode: a compromised app credential cannot destroy evidence.
- Access key scoped to one bucket, `s3:GetObject`/`PutObject`/`DeleteObject` only. No `s3:ListAllMyBuckets`, no policy management.
- Lifecycle rule expiring orphaned uploads (presigned PUT completed, row never created) after 24 h.
- No public host port; presigned URLs are proxied through Nginx.

---

## 11. Secrets and key management

| Secret | Storage | Rotation | On rotation |
|---|---|---|---|
| DB role passwords (×6) | Docker secret → Vault | 90 d | Rolling restart |
| JWT Ed25519 keypair | Docker secret → Vault | 90 d | Publish both keys during overlap; verify against either for one access-token TTL |
| `mfa_encryption_key` (KEK) | Vault, never on disk | 180 d | Re-encrypt all `staff.mfa_secret` under a versioned AAD |
| MinIO access key | Docker secret | 90 d | Rolling restart |
| Redis ACL passwords | Docker secret | 90 d | Rolling restart |
| TLS certificates | ACME / national CA | 90 d | Automated, monitored for expiry |

Rules:

- **No secret in git, in an image layer, or in an env var visible to `docker inspect`.** Secrets mount at `/run/secrets/`, read once at startup by pydantic-settings (`secrets_dir`), and are held as `SecretStr` so accidental logging prints `**********`.
- `gitleaks` runs in CI and as a pre-commit hook.
- `.env.example` lists every key with **no** real values.
- Any secret exposed in an incident is rotated immediately, not at the next scheduled window.
- Rotation is rehearsed in staging. An untested rotation procedure fails at the worst possible moment.

---

## 12. Supply chain and CVE management

### 12.1 Dependencies

```bash
uv lock                       # hash-pinned, fully resolved
uv sync --frozen --no-dev     # production install; refuses to resolve anything new
```

Every dependency is pinned by hash. A compromised upstream release cannot be silently pulled, because the hash will not match.

### 12.2 Continuous scanning

| Tool | Scope | When | Gate |
|---|---|---|---|
| `pip-audit` | Python deps vs OSV/PyPI advisories | every PR + nightly | fail on HIGH/CRITICAL |
| `trivy image` | OS packages + libs in the built image | every build + nightly | fail on HIGH/CRITICAL with a fix |
| `trivy config` | Dockerfile, compose misconfiguration | every PR | fail on HIGH |
| `bandit` | Python SAST | every PR | fail on HIGH |
| `semgrep` | custom rules (§9.1) + `p/python`, `p/owasp-top-ten` | every PR | fail on ERROR |
| `gitleaks` | committed secrets | pre-commit + CI | fail on any |
| `grype` / SBOM | CycloneDX SBOM, stored per release | every release | archived for audit |
| Renovate | dependency PRs | weekly, daily for security | auto-merge patch after tests |

**Nightly matters as much as per-PR.** A dependency that was clean when merged becomes vulnerable the day a CVE is published — nothing about the repository changes, so only a scheduled scan finds it.

### 12.3 Patch SLA

| Severity | Condition | Patch within |
|---|---|---|
| **KEV** | Listed in CISA Known Exploited Vulnerabilities | **24 hours** |
| Critical (CVSS ≥ 9.0) | Reachable from an unauthenticated path | 24 hours |
| Critical | Not reachable / requires auth | 7 days |
| High (7.0–8.9) | Reachable | 7 days |
| High | Not reachable | 30 days |
| Medium (4.0–6.9) | — | 30 days |
| Low | — | 90 days, or next release |

"Reachable" means an attacker can trigger the vulnerable code path through the API. A CVE in a transitive dev-only dependency is not the same emergency as one in `asyncpg`, and treating them identically causes alert fatigue — which is itself a vulnerability.

Subscriptions: CISA KEV feed, PostgreSQL security announcements, Python security advisories, FastAPI/Starlette/Pydantic releases, Nginx, Redis, Docker, GitHub Security Advisories.

### 12.4 Container hardening

```dockerfile
# backend/Dockerfile
FROM python:3.12-slim-bookworm@sha256:<digest> AS builder
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
WORKDIR /build
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY app ./app
RUN uv sync --frozen --no-dev

FROM python:3.12-slim-bookworm@sha256:<digest>
RUN groupadd -r watiq -g 10001 && \
    useradd -r -g watiq -u 10001 -s /usr/sbin/nologin watiq && \
    apt-get update && apt-get install -y --no-install-recommends libmagic1 && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=root:root /build/.venv /opt/watiq/.venv
COPY --from=builder --chown=root:root /build/app   /opt/watiq/app
# Root-owned, non-root-executed: the process cannot modify its own code.

ENV PATH="/opt/watiq/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /opt/watiq
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/healthz')"
ENTRYPOINT ["gunicorn","app.main:app","--worker-class","uvicorn.workers.UvicornWorker","--bind","0.0.0.0:8000"]
```

```yaml
# docker-compose.prod.yml (excerpt)
services:
  api:
    image: watiq-api:${VERSION}
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
      - seccomp:./ops/docker/seccomp-watiq.json
    user: "10001:10001"
    pids_limit: 256
    mem_limit: 1g
    ulimits:
      nofile: { soft: 8192, hard: 8192 }
    networks: [watiq_edge, watiq_app, watiq_data]
    secrets: [dsn_citizen, dsn_staff, dsn_auth, dsn_auditor, dsn_admin,
              jwt_private_key, jwt_public_key, mfa_encryption_key,
              s3_access_key, s3_secret_key]

networks:
  watiq_data:
    internal: true      # NO route to the internet from the data tier
```

`read_only: true` + root-owned code means a remote code execution cannot persist a webshell — and Wazuh FIM (§6) alerts if anything tries.

---

## 13. Resilience and availability

### 13.1 Timeouts everywhere

An unbounded wait is a resource leak with extra steps.

| Hop | Timeout |
|---|---|
| Client → Nginx (body/header) | 10 s |
| Nginx → API (connect/read) | 5 s / 30 s |
| API → Postgres statement | 5 s |
| API → Postgres idle-in-transaction | 10 s |
| API → Redis (connect/op) | 1 s / 2 s |
| API → MinIO | 10 s |
| API → payment gateway | 8 s + circuit breaker |
| ARQ job | 300 s hard kill |

### 13.2 Circuit breakers and graceful degradation

External calls (payment gateway, SMS, SMTP) run behind a circuit breaker: 5 consecutive failures opens it for 60 s; a half-open probe closes it.

| Failed component | Behaviour |
|---|---|
| Redis | Cache **fails open** to Postgres; rate limiting and idempotency **fail closed** (503 on writes). Read paths keep working |
| MinIO | Uploads/downloads 503; everything else unaffected |
| SMTP / SMS | Notifications queue in ARQ and retry with backoff; `notifications` rows are still written, so nothing is lost |
| Payment gateway | Circuit opens; payments stay `pending`; `reconcile_payments` settles them later |
| ClamAV | Documents stay `pending` and cannot be verified. **Fails closed** — an unscanned file is never marked clean |
| Postgres primary | Full outage. This is the one true SPOF; mitigated by streaming replication with a documented promotion runbook |

### 13.3 DoS resistance summary

| Vector | Control |
|---|---|
| SYN flood | nftables rate limit + `ct count` |
| Slowloris | Nginx header/body timeouts, `limit_conn` |
| HTTP flood | Nginx `limit_req`, CrowdSec, app rate limits |
| Large body | `client_max_body_size 12m`, `SecRequestBodyLimit` |
| Expensive query | `statement_timeout 5s`, indexed queries only, cursor pagination with max page size |
| JSONB bomb | §8.2 size/depth/key caps |
| Cache stampede | single-flight lock + TTL jitter |
| Slot hoarding | per-user booking limits, CrowdSec scenario |
| Amplification via OTP | 3/hour per principal |

---

## 14. Detection and response

### 14.1 Logging, with PII redaction

```python
# app/core/logging.py
import structlog

REDACT_KEYS = frozenset({
    "password", "password_hash", "plain_password", "token", "access_token",
    "refresh_token", "refresh_token_hash", "authorization", "cookie",
    "mfa_secret", "code_hash", "otp", "recovery_code",
    "national_id", "cin",
    # Watiq.sql explicitly forbids these two in plaintext logs.
    "transaction_id", "reference_number",
    "form_data", "storage_key", "address", "date_of_birth",
})


def redact_pii(logger, method_name, event_dict):
    for key in list(event_dict):
        if key.lower() in REDACT_KEYS:
            event_dict[key] = "[REDACTED]"
    return event_dict


structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        redact_pii,                       # BEFORE rendering, always
        structlog.processors.dict_tracebacks,
        structlog.processors.JSONRenderer(),
    ],
)
```

Every line carries `request_id`, `principal_type`, `principal_id`, `route`, `status`, `duration_ms`. **`principal_id` is an integer, never a name or CIN** — enough to investigate, not enough to leak.

### 14.2 Alerting

| Alert | Condition | Severity |
|---|---|---|
| Data-tier reachable externally | Suricata sid 9000001–3 | **P1 — page** |
| Data-tier egress | Suricata sid 9000010 | **P1 — page** |
| App code modified | Wazuh 100100 | **P1 — page** |
| Docker socket accessed | Wazuh 100102 | **P1 — page** |
| Refresh-token reuse | > 3 in 10 min | **P1 — page** |
| `InsufficientPrivilegeError` (42501) | any occurrence | **P1** — a column grant caught what code missed |
| Anomalous staff access | §14.3 | **P1** |
| Auth failure rate | > 100/min globally | P2 |
| WAF anomaly score spike | > 50 blocks/min | P2 |
| 5xx rate | > 1% over 5 min | P2 |
| DB pool saturation | > 80% for 5 min on any role | P2 |
| Cache hit ratio collapse | < 50% for 15 min | P3 |
| Certificate expiry | < 21 days | P3 |
| Backup restore drill failed | any | **P1** |

### 14.3 Insider-threat detection

This is what `access_log` was built for. The schema's comment says it outright: detect "a clerk browsing a neighbour's file."

```sql
-- Run every 15 minutes by the detect_anomalous_access ARQ job (watiq_admin).
WITH baseline AS (
    SELECT staff_id,
           AVG(daily_count)  AS mean_count,
           STDDEV(daily_count) AS sd_count
    FROM (
        SELECT staff_id, occurred_at::date AS d, COUNT(DISTINCT user_id) AS daily_count
        FROM access_log
        WHERE occurred_at >= CURRENT_DATE - INTERVAL '30 days'
          AND occurred_at <  CURRENT_DATE
          AND staff_id IS NOT NULL
        GROUP BY staff_id, occurred_at::date
    ) h
    GROUP BY staff_id
),
today AS (
    SELECT staff_id, COUNT(DISTINCT user_id) AS distinct_citizens
    FROM access_log
    WHERE occurred_at >= CURRENT_DATE AND staff_id IS NOT NULL
    GROUP BY staff_id
)
SELECT t.staff_id, t.distinct_citizens, b.mean_count, b.sd_count
FROM today t
JOIN baseline b USING (staff_id)
WHERE b.sd_count > 0
  AND t.distinct_citizens > b.mean_count + 3 * b.sd_count
  AND t.distinct_citizens > 20;          -- floor: ignore low-volume noise
```

Additional signals, all cheap to compute over `access_log`:

- Access outside the office's `opening_hours` (stored as JSONB on `offices`).
- A burst of `action = 'export'` or `'download'` — bulk extraction rather than counter work.
- A clerk accessing a citizen with no `requests` or `appointments` at their office (should be impossible under RLS — if it appears, RLS itself has been bypassed and this is a **P1**).
- Repeated `action = 'search'` with `query_params` matching surnames rather than tracking codes.

### 14.4 Incident response

`docs/runbooks/incident-response.md`:

1. **Detect** — alert fires or a report arrives.
2. **Triage** (15 min) — P1 pages on-call; classify: data breach / availability / integrity.
3. **Contain** —
   - Compromised staff account: `UPDATE staff SET is_active = FALSE`; revoke sessions (`revoked_reason = 'admin_revoke'`).
   - Compromised app credential: rotate the DB role password, restart, revoke all sessions.
   - Active exploitation: CrowdSec manual ban; if necessary, `SecRuleEngine On` with an emergency deny rule.
   - Host compromise: isolate the host at the network layer, **preserve it for forensics**, fail over.
4. **Investigate** — correlate `access_log`, Nginx, ModSecurity audit, Suricata EVE, Wazuh. Determine which citizens' data was accessed — `access_log` makes this answerable, which is the entire point of the table.
5. **Eradicate & recover** — patch, rebuild from a known-good image (never clean in place), restore from PITR if integrity is in doubt, rotate every secret the host could see.
6. **Notify** — affected citizens and the national data-protection authority (INPDP) within the statutory window. `access_log` is what makes an accurate notification possible; a guess is a second failure.
7. **Post-incident review** — blameless, within 5 working days, with dated action items.

---

## 15. Backup and disaster recovery

```conf
# ops/backup/pgbackrest.conf
[global]
repo1-path=/var/lib/pgbackrest
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass=__FROM_SECRET__
repo1-retention-full=4
repo1-retention-diff=7
repo2-type=s3                      # offsite, national datacenter #2
repo2-s3-bucket=watiq-backups
repo2-cipher-type=aes-256-cbc
repo2-retention-full=8
process-max=4
compress-type=zst
start-fast=y

[watiq]
pg1-path=/var/lib/postgresql/data
```

| Parameter | Target |
|---|---|
| RPO | ≤ 5 minutes (continuous WAL archiving) |
| RTO | ≤ 2 hours |
| Full backup | Weekly |
| Differential | Daily |
| WAL archive | Continuous |
| Retention | 4 full local, 8 full offsite |
| Encryption | AES-256, at rest and in transit |
| Offsite | Second national datacenter, **not** the same physical site |
| MinIO | Versioning + object lock + nightly replication |

**Restore drills are mandatory and automated.** A backup that has never been restored is a hypothesis.

```bash
# ops/backup/restore-drill.sh — cron, weekly. Failure is a P1 alert.
set -euo pipefail
DRILL_DIR=/var/lib/postgresql/drill
TARGET_TIME="$(date -u -d '2 hours ago' '+%Y-%m-%d %H:%M:%S+00')"

rm -rf "$DRILL_DIR"; mkdir -p "$DRILL_DIR"
pgbackrest --stanza=watiq --type=time --target="$TARGET_TIME" \
           --pg1-path="$DRILL_DIR" --delta restore

pg_ctl -D "$DRILL_DIR" -o "-p 5499" -w start

# Prove the RESTORE is usable, not merely that files were written.
psql -p 5499 -d watiq -v ON_ERROR_STOP=1 <<'SQL'
  SELECT count(*) > 0 AS has_users FROM users;
  SELECT count(*) = 5 AS has_all_roles FROM pg_roles
   WHERE rolname IN ('watiq_citizen','watiq_staff','watiq_auth',
                     'watiq_auditor','watiq_admin');
  -- The security model must survive the restore, not just the data.
  SELECT bool_and(relrowsecurity) AS rls_intact FROM pg_class
   WHERE relname IN ('users','requests','documents','payments','appointments');
  -- Watiq.sql defines 63 policies. A floor of 60 tolerates deliberate
  -- consolidation but catches a restore that dropped the access-control model.
  SELECT count(*) >= 60 AS policies_intact FROM pg_policies WHERE schemaname='public';
SQL

pg_ctl -D "$DRILL_DIR" -w stop
echo "restore drill OK for $TARGET_TIME"
```

The drill deliberately checks that **RLS policies survived the restore**. A restore that brings back the data without the policies is a silent, total loss of the access-control model — and it would look like a success.

---

## 16. Security testing

### 16.1 The RLS regression suite — non-negotiable

Everything in `Watiq.sql` §7 is only true while it is true. A migration, a refactor, or a hurried hotfix can quietly undo it. These tests are the guard.

```python
# backend/tests/security/test_rls_isolation.py
import pytest
from sqlalchemy import text

pytestmark = pytest.mark.asyncio


async def test_citizen_cannot_read_other_citizens_requests(citizen_conn, seed):
    """A -> B. THE canonical BOLA test."""
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        rows = (await conn.execute(
            text("SELECT id FROM requests WHERE id = :rid"),
            {"rid": seed.request_of_citizen_b.id},
        )).all()
    assert rows == [], "RLS BREACH: citizen A read citizen B's request"


async def test_citizen_cannot_read_other_citizens_documents(citizen_conn, seed):
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        rows = (await conn.execute(
            text("SELECT id FROM documents WHERE id = :did"),
            {"did": seed.document_of_citizen_b.id},
        )).all()
    assert rows == []


async def test_clerk_cannot_read_other_office_requests(staff_conn, seed):
    async with staff_conn(staff_id=seed.clerk_tunis.id,
                          office_id=seed.office_tunis.id) as conn:
        rows = (await conn.execute(
            text("SELECT id FROM requests WHERE office_id = :oid"),
            {"oid": seed.office_sfax.id},
        )).all()
    assert rows == [], "RLS BREACH: cross-office read"


async def test_national_auditor_permission_grants_cross_office_read(staff_conn, seed):
    """The positive control. Without it, an all-deny bug would pass every
    other test in this file."""
    async with staff_conn(staff_id=seed.auditor.id,
                          office_id=seed.office_tunis.id) as conn:
        rows = (await conn.execute(
            text("SELECT id FROM requests WHERE office_id = :oid"),
            {"oid": seed.office_sfax.id},
        )).all()
    assert len(rows) > 0


async def test_unset_context_returns_nothing(citizen_conn):
    """No identity => NULLIF('', ...) => NULL => matches nothing."""
    async with citizen_conn(user_id=None) as conn:
        rows = (await conn.execute(text("SELECT id FROM requests"))).all()
    assert rows == []


async def test_context_does_not_leak_across_transactions(citizen_conn, seed):
    """set_config(..., true) must be transaction-local. If this fails, pooled
    connections carry identity between citizens."""
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        assert (await conn.execute(text("SELECT app_current_user_id()"))).scalar() \
               == seed.citizen_a.id
    async with citizen_conn(user_id=None) as conn:
        assert (await conn.execute(text("SELECT app_current_user_id()"))).scalar() is None


async def test_app_roles_are_not_schema_owner(any_app_conn):
    """The catastrophic misconfiguration: RLS does not apply to owners."""
    async with any_app_conn() as conn:
        assert (await conn.execute(text("SELECT current_user"))).scalar() \
               not in ("postgres", "watiq_migrate")
        assert (await conn.execute(text("SELECT rolsuper FROM pg_roles "
                                        "WHERE rolname = current_user"))).scalar() is False
        owns = (await conn.execute(text(
            "SELECT count(*) FROM pg_class c JOIN pg_roles r ON c.relowner = r.oid "
            "WHERE r.rolname = current_user AND c.relkind = 'r'"))).scalar()
        assert owns == 0, "app role owns tables; RLS would be bypassed"
```

### 16.2 Column-privilege tests

```python
# backend/tests/security/test_column_grants.py
from asyncpg.exceptions import InsufficientPrivilegeError


async def test_citizen_cannot_set_own_request_status(citizen_conn, seed):
    """Layer 3. Even with a total service-layer bypass, this fails."""
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        with pytest.raises(InsufficientPrivilegeError):
            await conn.execute(
                text("UPDATE requests SET status_id = :s WHERE id = :r"),
                {"s": seed.status_approved.id, "r": seed.request_of_citizen_a.id},
            )


async def test_citizen_cannot_self_verify_document(citizen_conn, seed):
    async with citizen_conn(user_id=seed.citizen_a.id) as conn:
        with pytest.raises(InsufficientPrivilegeError):
            await conn.execute(
                text("UPDATE documents SET status = 'verified' WHERE id = :d"),
                {"d": seed.document_of_citizen_a.id},
            )


async def test_staff_cannot_read_password_hash(staff_conn, seed):
    async with staff_conn(staff_id=seed.clerk_tunis.id,
                          office_id=seed.office_tunis.id) as conn:
        with pytest.raises(InsufficientPrivilegeError):
            await conn.execute(text("SELECT password_hash FROM staff LIMIT 1"))


async def test_staff_cannot_read_mfa_secret(staff_conn, seed):
    async with staff_conn(staff_id=seed.clerk_tunis.id,
                          office_id=seed.office_tunis.id) as conn:
        with pytest.raises(InsufficientPrivilegeError):
            await conn.execute(text("SELECT mfa_secret FROM staff LIMIT 1"))


async def test_clerk_cannot_refund_payment(staff_conn, seed):
    """Clerk lacks payment.refund, so the RLS policy denies the UPDATE
    even though the payment is inside their office scope."""
    async with staff_conn(staff_id=seed.clerk_tunis.id,
                          office_id=seed.office_tunis.id) as conn:
        result = await conn.execute(
            text("UPDATE payments SET status = 'refunded' WHERE id = :p"),
            {"p": seed.payment_tunis.id},
        )
    assert result.rowcount == 0
```

### 16.3 The rest

| Test | Tool | Asserts |
|---|---|---|
| No PII in cache | custom | After a full E2E run, no Redis key or value matches a CIN, email, or phone pattern |
| Overbooking race | pytest + asyncio | 50 concurrent bookings on a capacity-10 slot → exactly 10 succeed |
| Tracking-code entropy | statistical | 100 000 generated codes: no collision, uniform distribution |
| Authz matrix | parametrized | Every (role × endpoint) pair returns the expected status |
| DAST | OWASP ZAP baseline + full scan | No HIGH findings against staging |
| API fuzzing | Schemathesis over the OpenAPI spec | No 500 on any generated input |
| Load | k6 | p95 < 300 ms at 1 000 rps on catalogue search |
| Penetration test | external firm | Annually, and before any major release |

---

## 17. Residual risk — what this does *not* stop

Stated plainly, because a security document that only lists strengths is a liability.

| Risk | Why it survives every control above | Compensation |
|---|---|---|
| **0-day in the kernel, Postgres, Nginx, or Python** | By definition unpatched and unsignatured | Defence in depth, minimal attack surface, egress restriction, 24 h KEV SLA, IDS/HIDS for post-exploitation behaviour |
| **Compromised privileged operator** | Root defeats FIM, can read `/run/secrets`, can `SET ROLE` to the owner and bypass all RLS | Bastion + key-only SSH + MFA, separation of duties, auditd on secret reads, immutable offsite backups, alerting to a system the operator does not administer |
| **Social engineering of staff MFA** | A helpdesk that resets MFA over the phone defeats TOTP entirely | `staff_recovery_codes` exists precisely to remove the manual reset path; identity-verification procedure for any reset; anomaly detection on post-reset behaviour |
| **RLS GUCs are asserted by the application** | `Watiq.sql` §7 says so explicitly: anyone who can run arbitrary SQL on the connection can `SET` a different office id | This is why §9 injection defence and §12 dependency hygiene are load-bearing, not optional. RLS defends against application *bugs*, not against SQL execution |
| **Supply-chain compromise upstream of us** | A backdoored release with a valid hash and signature | SBOM, pinned digests, Renovate delay window on non-security updates, egress restriction limits what a backdoor can reach |
| **Physical compromise of the datacenter** | Outside the software boundary | Encryption at rest, offsite backups, physical security is the hosting authority's control |
| **Postgres primary as SPOF** | Full outage on failure | Streaming replication + documented promotion runbook; PITR bounds data loss to ~5 min |
| **Business-logic flaws unique to Watiq** | No scanner finds "a supervisor can approve their own relative's permit" | Threat modelling per feature, four-eyes on high-value approvals, `access_log` review, annual penetration testing |
| **Insider with legitimate access acting within scope** | A clerk viewing a file they are *entitled* to view, for a corrupt reason | Cannot be prevented technically — only **detected** (§14.3) and **proven** (`access_log`). This is why the table records reads, not just writes |

### The honest summary

Watiq is designed so that a single mistake — a forgotten `WHERE`, a missed permission check, an XSS in the SPA, a leaked application credential — does not become a citizen-data breach. That is a genuinely high bar, and considerably higher than most production systems clear.

It is not immunity. Immunity is not available. What is available, and what this design delivers, is that an attacker must chain **several** independent failures, will be slowed and logged at each step, and will leave evidence in a place they cannot reach — and that when something does go wrong, the answer to "whose data was accessed?" is a query, not a guess.

Security is an operational practice, not a document. This file is only true while the scans run, the drills pass, the alerts are read, and the RLS suite stays green.
