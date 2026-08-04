#!/usr/bin/env python3
"""Crawl the running app and verify every asset and internal link resolves.

Stands in for a browser: catches missing images, 500s, dangling links and any
asset the CSP would reject, none of which the template tests can see.
"""
import re, sys, urllib.request, urllib.error, collections

BASE = "http://127.0.0.1:5000"
PAGES = ["/", "/login", "/login?staff=1", "/register", "/password-reset",
         "/password-reset?stage=confirm", "/services", "/services?category=civil",
         "/services?q=passport", "/track", "/contact", "/help", "/about",
         "/legal/privacy", "/legal/terms", "/accessibility", "/open-data",
         "/no-such-page"]

def fetch(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=20) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return 0, str(e)

assets, links, problems = set(), set(), []
for path in PAGES:
    status, html = fetch(path)
    expected = 404 if path == "/no-such-page" else 200
    if status != expected:
        problems.append(f"{path} -> HTTP {status} (expected {expected})")
        continue
    for host in ("cdn.tailwindcss.com", "fonts.googleapis.com", "fonts.gstatic.com",
                 "lh3.googleusercontent.com"):
        if host in html:
            problems.append(f"{path} references remote host {host}")
    if re.search(r'\sstyle="', html):
        problems.append(f"{path} has an inline style attribute")
    if 'href="#"' in html:
        problems.append(f"{path} has a placeholder href")
    # Every page must resolve the design tokens to *something*: either one of
    # the per-mockup tk-* overrides, or the plain house theme that _page.html
    # uses on purpose for the screens that had no mockup of their own.
    if not re.search(r'<html[^>]*class="[^"]*(tk-|light|dark)', html):
        problems.append(f"{path} carries no theme class")
    assets.update(re.findall(r'(?:src|href)="(/static/[^"]+)"', html))
    links.update(m for m in re.findall(r'href="(/[^"#?]*)', html))

for asset in sorted(assets):
    status, _ = fetch(asset)
    if status != 200:
        problems.append(f"asset {asset} -> HTTP {status}")

for link in sorted(links):
    status, _ = fetch(link)
    if status not in (200, 302):
        problems.append(f"link {link} -> HTTP {status}")

print(f"{len(PAGES)} pages, {len(assets)} static assets, {len(links)} internal links")
if problems:
    print(f"\n{len(problems)} PROBLEMS:")
    for p in problems:
        print("  " + p)
    sys.exit(1)
print("all clean")
