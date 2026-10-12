# Security Policy

Yuto stores personal financial data on the owner's own server.

## Reporting a vulnerability
Please do not open a public issue. Use GitHub's private vulnerability reporting
(Security tab -> "Report a vulnerability") on this repository.
Include what you found, how to reproduce it, and the version or commit.

## Scope
Authentication and session handling, data exposure, injection, and anything that
makes Yuto contact an outside server without the owner opting in.

## Operator reminders
- Keep Yuto behind HTTPS (reverse proxy) and keep `COOKIE_SECURE=true`.
- Use long random values for `JWT_SECRET` and `YUTO_PASSWORD`.
- Back up before every upgrade.
