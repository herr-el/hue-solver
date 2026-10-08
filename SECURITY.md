# Security

Hue Solver is a static, client-only web app: no backend, no accounts and no network requests after the page has loaded. Images are processed in the browser and stored only in that browser (IndexedDB).

## Reporting

Please use GitHub's **Report a vulnerability** button (Security tab) for anything sensitive, or open a normal issue for minor things.

## Built-in hardening

- A Content-Security-Policy `<meta>` tag in `index.html` restricts scripts, styles, workers and fonts to the app's own origin, so it applies on any host, including GitHub Pages.
- Images larger than 40 megapixels are rejected before processing.
- Dynamic text is escaped before it reaches the page.

## When you host it yourself

The included `nginx.conf` additionally sends the CSP as a header (adding `frame-ancestors 'none'`, which a meta tag cannot set), plus `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`, and refuses dotfiles. Copy these headers if you use another web server.
