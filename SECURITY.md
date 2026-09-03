# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub Security Advisories to report it privately, including reproduction steps, affected versions, impact, and a suggested fix.

## Security baseline

- Never commit `.env`, database credentials, JWT secrets, broker exports, screenshots, or user trade data.
- Use a long, randomly generated `JWT_SECRET` in every non-local environment.
- Keep `FRONTEND_URL` restricted to the deployed frontend origin; do not use `*` with credentials.
- Keep dependencies current through Dependabot and review lockfile changes.
- Treat imported files and OCR output as untrusted input. Validate on the server before persistence.
- Use HTTPS, secure secret storage, database least privilege, backups, and log redaction in production.
- Rotate credentials immediately after suspected exposure and revoke affected sessions.
