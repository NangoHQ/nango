---
sidebar_label: Gmail
---
# Gmail API wiki

:::note Working with the Google Calendar API?
Please add your learnings, favorite links and gotchas here by [editing this page](https://github.com/nangohq/nango/tree/main/docs/docs/providers/google-mail.md).  

:::

## Using Gmail with Nango
Provider template name in Nango: `google-mail`  
Follow our [getting started guide](../reference/guide.md) to add an OAuth integration with Gmail in 5 minutes.

## App registration & publishing
*No information yet, feel free to contribute it (or check out [airtable](airtable.md) for an example)*

## Useful links
- [Gmail access token specs](https://cloud.google.com/iam/docs/reference/sts/rest/v1/TopLevel/token#response-body)

## API specific gotchas
*No gotchas yet, feel free to contribute it (or check out [airtable](airtable.md) for an example)*

## Setting up an OAuth app with Gmail
- Go to the [Gmail API Console](https://console.cloud.google.com/apis/library/gmail.googleapis.com) and click _ENABLE_ if not already enable
- You will be redirect to the _OAuth consent screen_ creation flow. If not, go [here](https://console.cloud.google.com/apis/credentials/consent) and create/edit the OAuth app
    - Select _External User Type_ if prompted
    - Select _User data_ if prompted
    - Add the right scopes for your use case, e.g. `https://mail.google.com/` for extended capabilities
- Once the OAuth app is configured, create new _OAuth credentials_ [here](https://console.cloud.google.com/apis/credentials/oauthclient)
    - Add the _Authorized JavaScript origins_, i.e. you site URL (`http://localhost:8000` if you're doing the [Quickstart](../quickstart.md) locally)
    - Add the _Authorized redirect URIs_, i.e. **[NANGO-SERVER-URL]/oauth/callback** (`http://localhost:3003/oauth/callback` if you're doing the [Quickstart](../quickstart.md) locally)
    - Copy the _Client ID_ somewhere. Download the credentials and copy the `client_secret` it contains (or find it on the OAuth credentials page from [here](https://console.cloud.google.com/apis/credentials))

Now that you have a **client ID**, **client secret**, **configured scope(s)** and **configured callback URL**, you can follow the [Quickstart](../quickstart.md) or more-detailed [Step-By-Step Guide](../reference/guide.md) to query the Gmail API on behalf of users.