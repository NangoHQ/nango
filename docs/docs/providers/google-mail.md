# Gmail

### Get started

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

### Additional info

- [Gmail OAuth docs](https://developers.google.com/identity/protocols/oauth2)
- [Gmail access token specs](https://cloud.google.com/iam/docs/reference/sts/rest/v1/TopLevel/token#response-body)