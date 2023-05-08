# Build custom unified APIs with Nango

Nango was built from the ground up for extensibility: The core Nango platform and infrastructure is API agnostic.

This makes it easy for any Nango user to extend the existing unified APIs and build entirely custom ones on top of the Nango infrastructure.

[![Nango Custom Unified APIs Overview](/img/nango-custom-unified-apis-overview.png)](/img/nango-custom-unified-apis-overview.png)

## Creating custom unified APIs in Nango

The three Nango components work together to let you easily write your own unified API.

### Nango Auth - API access & integrations metadata

[Nango Auth](/nango-auth/core-concepts) contains pre-built authentication for 90+ external APIs. It handles the auth with the user and the API, keeps track which user has setup which integration and stores related configuration.

### Nango Sync - Continuous data syncing with external APIs

Nango Sync is a service that makes it easy to continuously sync in data from external APIs. It offers a lightweight framework for scheduling, pagination, retries, rate-limit handling, webhook handling etc.

Within Sync you define sync jobs, for instance:

-   Pull in a user's GitHub issues
-   Fetch all the linear projects
-   Fetch all Asana tasks
-   etc.

Each sync job gets its own cache, so full refreshes only need to be done once and the service understands changes in the synced data (additions, modifications, deletions etc.).

### Nango Unify - Data modelling & schema mapping

Nango Unify defines the data models available in the Nango SDKs and API.

These models can make use of one or several Sync caches. For instance you can combine data from GitHub, Asana and Jira to offer a unified view of `Tickets`, `Projects` or `Comments`.

You can both define your own data models for unify and write your own logic of how model data maps to caches in Sync.

## Request access

Custom unified APIs are currently in private beta.

If you are interested in this feature please reach out to us on the [Slack community](https://nango.dev/slack) and we are happy to tell you more!
