# Security Policy

## Reporting a Vulnerability

Report vulnerabilities **only** through a private GitHub Security Advisory:

**[Report a vulnerability](https://github.com/NangoHQ/nango/security/advisories/new)**

We do not accept security reports by email or any other channel, and we will not triage them. Do not open public GitHub issues, discussions, or pull requests for security vulnerabilities.

Each report should include:

- a description of the issue and its root cause
- the affected component, endpoint, and version or commit
- step-by-step reproduction against a supported configuration (see Scope)
- proof-of-concept details
- the impact you have demonstrated, kept separate from impact you are inferring
- whether any data was accessed

Submit one report per root cause.

## Scope

In scope:

- Nango Cloud
- Nango Enterprise deployments configured according to our documentation
- The latest release of the open source Nango repository, deployed according to our documentation

## Out of Scope

We will close the following without further review:

- **Self-hosted misconfiguration.** Issues that only arise when a deployment does not follow our documentation. Examples: required secrets left unset, left at default values, or set to weak values (such as `NANGO_ADMIN_KEY` or `NANGO_ENCRYPTION_KEY`), default credentials, services exposed publicly when the documentation says they should not be, or missing TLS.
- **Unsupported or unlicensed configurations.** Issues that depend on running features or deployment modes outside their licensed or supported use. For example, functions on free self-hosted Nango, or the local runner in production.
- **Trusted-operator actions.** Issues that require privileges that already grant equivalent access, such as the ability to deploy code, change instance configuration, or access the host.
- **Known or duplicate issues.** Issues already reported, already publicly documented, or already covered by a published advisory.
- Reports from automated scanners without a demonstrated, exploitable impact.
- Missing security headers, cookie flags, or best-practice recommendations without a demonstrated exploit.
- Denial of service, volumetric attacks, or rate-limiting findings.
- Social engineering, phishing, or physical attacks.
- Vulnerabilities in third-party dependencies without a demonstrated exploit path in Nango.

## Testing Rules

- Test only against your own local instance or your own accounts.
- Do not access, modify, or delete data that does not belong to you.
- Do not run automated scanning or load testing against Nango Cloud.

## Coordinated Disclosure

Do not disclose the issue publicly until we have had a reasonable opportunity to investigate and fix it. We will acknowledge valid reports through the advisory, and coordinate remediation and disclosure there.

## Rewards and Recognition

Nango does not operate a bug bounty program and does not offer monetary rewards.

If a valid, in-scope report leads to a published advisory, we will credit the reporter as a finder unless they ask us not to.