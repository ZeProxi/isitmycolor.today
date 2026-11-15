# Security

This site stores phone numbers and, optionally, email addresses of people who sign up for alerts.
If you find a way to read, change, or send to someone else's data, please report it privately.

**How:** open a private security advisory on this repository (Security tab → Report a vulnerability).
Do not open a public issue for security problems.

**Scope that matters most**

- Session cookies and the one-time code flow (`src/lib/auth.ts`, `src/app/api/auth/*`)
- Anything under `/api/me`
- The cron endpoint's secret check (`src/app/api/cron/notify`)
- The saved-page rendering (`src/components/SavedPageFrame.tsx`), which displays HTML fetched from a third party

Secrets live in AWS SSM Parameter Store, never in the repository. If you believe a secret has leaked,
say so in the advisory and it will be rotated.
