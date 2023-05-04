---
slug: '/'
sidebar_label: Introduction & Overview
---

# Nango: The open-source unified API.

Dozens of pre-built API integrations for your app. Easily extend, customize and build your own.

## ⭐ Nango at a glance

Nango is a service for easy integrations with external APIs:

Leverage dozens of pre-built use cases with our unified APIs. Or extend them and build entirely custom integrations on top of our open, scalable platform.

With Nango you get:

-   pre-built unified APIs for many use cases (CRM, Ticketing, HRIS etc.)
-   a pre-built OAuth service for all supported APIs (can also be used standalone)
-   support for 90+ external APIs
-   extensible platform to build your own, custom unified APIs

Nango is easy to try in 5 minutes:

-   1-liner to start a new (O)Auth flow in your frontend (supports all 90+ external APIs):

```ts
let result = await nango.auth('github', '<user-id>');
```

-   in your backend, easily fetch always up to date data with our fully typed SDK:

```ts
let contacts = await nango.crm.getContacts('<user-id>');
```

-   or only use the (O)Auth service and make any API call with the access token (or [proxy](nango-unified-apis/proxy)):

```ts
let token = await nango.getToken('github', '<user-id>');
```

## 📺 30-second demo {#demo}

<iframe width="864" height="486" src="https://www.youtube.com/embed/BK15QI-jWi0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>

## 👾 Out of the box support for 3 unified APIs and 90+ external APIs

Nango supports 3 unified APIs:

-   [**CRM:**](/nango-unified-apis/crm) Salesforce, HubSpot, Zoho, Pipedrive.
-   [**Ticketing:**](/nango-unified-apis/ticketing) Jira, GitHub, Asana, Clickup, Gitlab.
-   [**HRIS:**](/nango-unified-apis/hris) BambooHR, Rippling, Workday, Gusto, Personio, Zenefits.

More are coming soon and you can always [build your own, custom unified API](nango-unified-apis/custom-unified-api).

Or build custom integrations with 90+ supported external APIs. Including:

-   **CRM**: Front, Hubspot, Salesforce, etc.
-   **Accounting**: Xero, Sellsy, Zoho Books, etc.
-   **Fintech:** Brex, Stripe, Braintree, Ramp etc.
-   **Developer tools**: GitHub, GitLab, Linear, Jira etc.
-   **Communication**: Gmail, Microsoft Teams, Slack, Discord, Zoom etc.
-   **Productivity**: Asana, Airtable, Google Drive, Google Calendar, Trello, Google sheets, ClickUp etc.
-   **Social**: Twitter, LinkedIn, Reddit, Facebook etc.
-   [and more...](https://nango.dev/oauth-providers)

If your favorite API is missing [open a GitHub issue](https://github.com/NangoHQ/nango/issues/new) or [contribute it right away](https://docs.nango.dev/contribute-api).

## 🔍 Where to learn more

-   Explore [the full list of supported APIs](https://nango.dev/oauth-providers)
-   [Contribute a new provider](contribute-api)
-   Share feedback or ask questions on the [Slack community](https://nango.dev/slack)
-   Check our [blog on native integrations](https://www.nango.dev/blog)

## 🐻 History

Pizzly was originally developed by the team at [Bearer](https://www.bearer.com/?ref=pizzly) with contributions of more than 40+ individuals. Over time the focus of Bearer shifted and they could no longer maintain Pizzly. In late 2022 the team at [Nango](https://www.nango.dev) adopted the project and has since developed it together with the growing Nango community.
