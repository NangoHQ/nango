Integrations in Pizzly are derived from individual JSON configuration files, located in the [`/integrations`](https://github.com/Bearer/Pizzly/tree/master/integrations) directory at the root of the Pizzly project. For example, the GitHub integration is configured at [`/integrations/github.json`](https://github.com/Bearer/Pizzly/blob/master/integrations/github.json) and looks like this:

```json
{
  "name": "GitHub",
  "auth": {
    "authorizationURL": "https://github.com/login/oauth/authorize",
    "tokenURL": "https://github.com/login/oauth/access_token",
    "authType": "OAUTH2",
    "tokenParams": {},
    "authorizationParams": {},
    "auth": { "accessType": "offline" }
  },
  "request": {
    "baseURL": "https://api.github.com/",
    "headers": {
      "Accept": "application/vnd.github.v3+json",
      "Authorization": "token ${auth.accessToken}",
      "User-Agent": "Pizzly"
    }
  }
}
```

All requests sent to the third-party APIs are made based on the content of the relevant configuration file.

## Supported API integrations

There are dozens of APIs pre-configured with Pizzly ([full list here](/docs/supported-apis.md). But if the API you are looking for is not listed yet, you can create a new JSON configuration file with the name of the API.

## Adding a new integration

Adding a new integration to Pizzly involves two parts: Creating the integration JSON config file, and importing the new config into the integrations manifest at `/integrations/index.ts`.

### The integration JSON file

Each API has a configuration JSON file associated with it. The file is located within the `/integrations/` directory and is named afterward the API name (in lowercase).

| API Name | Configuration file name                                                                | OAuth Type |
| -------- | -------------------------------------------------------------------------------------- | ---------- |
| GitHub   | [github.json](https://github.com/Bearer/Pizzly/blob/master/integrations/github.json)   | OAuth 2.0  |
| Reddit   | [reddit.json](https://github.com/Bearer/Pizzly/blob/master/integrations/reddit.json)   | OAuth 2.0  |
| Twitter  | [twitter.json](https://github.com/Bearer/Pizzly/blob/master/integrations/twitter.json) | OAuth 1.0a |

In case the API name has several words, use an hyphen between each word (e.g [google-calendar.json](https://github.com/Bearer/Pizzly/blob/master/integrations/google-calendar.json)).

### The integration structure

Each JSON file has four top-level keys: `name`, `image`, `auth`, and `request`.

```jsonc
{
  // The name of the integration
  "name": "API Name",

  // Image URL for API logo (optional)
  "image": "https://path.to.image.url.jpg"

  // All authorization-related settings
  "auth": {}

  // Defines how to perform API requests
  "request": {}
}
```

#### `name` and `image`

The name and image keys define how the API will be displayed in the Pizzly dashboard. Image is optional, and will be picked up by Clearbit's image API if omitted. If you notice an image not showing up adding an image URL is recommended. (As can be seen in the Google Calendar integration file)

#### `auth` (for Authentication)

The next main section is the `auth` key. This object contains all the necessary information needed for Pizzly to perform the OAuth dance with the API provider. These values can often be found at the authentication page of the API provider's documentation. Some are specific to the authentication type.

- `authType`: The authentication type, either `OAUTH1` or `OAUTH2`.
- `authorizationURL` (OAUTH2): The URL that users are redirected to when asked to authorize your application. Usually the provider's auth endpoint, such as `https://github.com/login/oauth/authorize`.
- `tokenURL` (OAUTH2): The URL used to exchange the auth code for the token during the auth flow. For example: `https://github.com/login/oauth/access_token`.
- `requestTokenURL` (OAUTH1): The URL provided by the API for retrieving the request token.
- `accessTokenURL` (OAUTH1): The URL provided by the API for retrieving the access token.
- `userAuthorizationURL` (OAUTH1): The URL provided by the API for authorizing the user.
- `signatureMethod` (OAUTH1): The method used by the API to sign requests.
- `authorizationParams`: This object contains any static parameters that need to be passed in during authorization. For example, the Discord API expects `"response_type": "code"` and `"grant_type": "authorization_code"` to be sent during authorization. Pizzly will send common dynamic values back to the API.
- `tokenParams`: Similar to the `authorizationParams` key, this object contains any required static parameters that need to be sent to the token URL. For example, GitLab expects the `response_type` with the authorization URL, but `grant_type` with the token URL.

In cases where `authorizationParams` or `tokenParams` are not required, they can be left as empty objects or omitted completely.

```jsonc
{
  "name": "API Name",
  "image": "https://path.to.image.url.jpg",

  // All authorization-related settings
  "auth": {
    // This is the URL that user's will be directed to when
    // initiating the authorization flow.
    "authorizationURL": "https://example.api/oauth",

    // The URL used for exchanging the auth code for a token
    "tokenURL": "https://example.api/oauth/token",

    // Set to either OAUTH1 or OAUTH2
    "authType": "OAUTH2",

    // Any fixed parameters that the API expects during token exchange
    "tokenParams": {
      // The grant_type is a common token parameter
      "grant_type": "authorization_code"
    },

    // Set any required, fixed, parameters to be passed during authorization
    // ex. state, access_type, prompt, etc
    "authorizationParams": {
      "response_type": "code"
    }
  }
}
```

#### `request`

The final part of the config file is the `request` key. It takes the `baseURL`, an object of `headers`, and an object of `params`. This is also where you will need to take advantage of the variable interpolations that Pizzly offers. You may have seem them in the other config files, such as `${auth.accessToken}`. These properties are dependant on the API provider and auth type. For example:

```jsonc
{
  "name": "API Name",
  "image": "https://path.to.image.url.jpg",
  "auth": {},
  "request": {
    // The API base URL
    "baseURL": "https://api.example.com/",

    // Extra headers that will be passed with each request
    "headers": {
      "Accept": "application/json",
      "Authorization": "Bearer ${auth.accessToken}",
      "User-Agent": "Pizzly"
    },

    // Extra parameters that will be passed in the body of each API call
    "params": {
      "example": "value"
    }
  }
}
```

## Interpolations

Some APIs require extra information than Pizzly supports per se. To support this APIs, the configuration file can use extra variable interpolations.

You might have notice the `${auth.accessToken}` which is used in all integration's configurations. Others available interpolation objects are the `${headers.[...]}` and `${connectParams.[...]}`.

This can be used for APIs that require more information than Pizzly currently supports. For example, an API that requires a custom base URL can be accessed by passing a header with each API call. Pizzly's proxy will make sure to replace the variable from the configuration with the value provided in the header, e.g. : `"baseURL":"https://${headers.api_account_name}.example.com"`

## Add the integration to the `index.ts` file in `/integrations`

The `index.ts` file in the integrations folder imports all integrations when the Pizzly server starts. To begin testing and using your new integration, add an import statement to `index.ts`.

## Testing your configuration

Make sure that your integration works locally. To start testing a new integration, follow the instructions for [Running Pizzly on your machine](/docs/readme.md). Confirm that Pizzly is working locally by visiting `http://localhost:8080` before attempting to add a new integration.

## Further configuration

Most settings are described in this page, but we recommend using an existing API's configuration file that matches the auth type of the new API.
