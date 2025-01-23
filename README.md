<div align="center">

<img src="/assets/nango-logo.png?raw=true" width="350">

</div>

<h1 align="center">One platform for all your integrations.</h1>

<div align="center">
Ship integrations fast. Maintain full control.
</div>

<p align="center">
    <br />
    <a href="https://docs.nango.dev/" rel="dofollow"><strong>Explore the docs »</strong></a>
    <br />

  <br/>
    <a href="https://nango.dev/integrations">300+ pre-configured APIs</a>
    ·
    <a href="https://nango.dev">Website</a>
    ·
    <a href="https://docs.nango.dev/guides/new-api-support">Contribute an API</a>
    ·
    <a href="https://nango.dev/slack">Slack Community</a>
</p>

Nango is a single API to interact with all other external APIs. It should be the only API you need to integrate to your app.

<img src="/docs-v2/images/overview.png">

# 📺 Demo video

[![what-is-nango](/docs-v2/images/video-thumbnail.png)](https://youtu.be/oTpWlmnv7dM)

# 👩‍💻 Sample code

Initiate a new OAuth flow from your frontend:

```js
nango.openConnectUI();
```

Get structured objects from external APIs from your backend:

```ts
nango.listRecords<GithubIssue>({
    providerConfigKey: 'github',
    connectionId: 'user123',
    model: 'GithubIssue',
});
```

# 👩🏻‍🔧 Pre-built and custom integrations

Nango's flexibility ensures it supports any API integration:

1. **Pre-built integrations**: Utilize pre-built integrations for popular APIs and standard use-cases to ship fast.
2. **Custom integrations**: Build your own integrations in code with limitless customization capabilities.
3. **Managed integrations**: Leverage Nango experts to create and maintain your integrations end-to-end.

# 🔌 300+ pre-built APIs & integrations, or build your own!

[Over 300 APIs are pre-configured](https://nango.dev/integrations) to work right out of the box. We support 25+ categories such:

- **Accounting**: Netsuite, Quickbooks, Xero, ...
- **Communications**: Slack, Discord, Teams, ...
- **CRMs**: Hubspot, Salesforce, ...
- **Emails**: Gmails, Outlook, ...
- **HR**: Deel, Gusto, BambooHR, Personio, ...
- **Identity**: Okta, Auth0, ...
- **Knowledge Bases**: Notion, Drive, ...
- **Ticketing**: Linear, Jira, ...
- **Support**: Zendesk, ...
- **Video**: Zoom, Google Meet, ...
- and [many more](https://nango.dev/integrations)

But remember, Nango can work with **any API and any use-case**!

# 🚀 Get started

Sign up for free:

<a href="https://app.nango.dev/signup" target="_blank">
  <img src="https://raw.githubusercontent.com/NangoHQ/nango/6f49ab92c0ffc18c1d0f44d9bd96c62ac97aaa8d/docs/static/img/nango-deploy-button.svg" alt="Try Nango Cloud" width="215"/>
</a>

# 🙋‍♀️ Why is Nango open-source?

Our mission is to enable all SaaS to seamlessly integrate together. By being open source, every engineer can contribute improvements to the platform for everyone:

- [Contribute an API](https://docs.nango.dev/guides/new-api-support)
- [Create a custom integration](https://docs.nango.dev/guides/custom-integrations/overview)
- [Extend an integration template](https://docs.nango.dev/guides/custom-integrations/extend-a-pre-built-integration)

# 📚 Learn more

- [Learn how to integrate Nango](https://docs.nango.dev/integrate/overview)
- [Asks questions on the community](https://nango.dev/slack)
- [Book a demo](https://calendly.com/rguldener/30min)

# 💪 Contributors

Thank you for continuously making Nango better ❤️

<a href="https://github.com/nangohq/nango/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nangohq/nango" />
</a>

# 🐻 History

Pizzly (a simple service for OAuth) was initially developed by the team at [Bearer](https://www.bearer.com/?ref=pizzly) with contributions of more than 40 individuals. Over time the focus of Bearer shifted and they could no longer maintain Pizzly. In late 2022 the team at [Nango](https://www.nango.dev) adopted the project and has since maintained and evolved it together with the growing Nango community.
