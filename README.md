# Pizzly 🐻 - The OAuth Integration Proxy

<div align="center">

<img src="views/assets/img/logos/pizzly.png?raw=true" width="300">

The OAuth Integration Proxy

<!-- Build badge || License Badge || Heroku badge
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
-->
</div>

Pizzly is an OAuth Integration Proxy that acts as an abstraction layer to simplify integrating with OAuth API. It let you connect out-of-the-box to 50+ OAuth APIs and automatically manage retrieving, storing and refreshing OAuth tokens. It also supports adding new OAuth API by using a simple file definition.

Pizzly is made available as an open-source project by [Bearer.sh](https://bearer.sh/?ref=pizzly).

## Summary

- [Why Pizzly?](#why-pizzly)
- [How it works](#how-it-works)
- [Key Features](#key-features)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Supported APIs](#supported-apis)
- [License](#license)

## Why Pizzly?

Pizzly is an original project, originally started at Bearer.sh, to simplify developer's journey and ease how to build API integrations. OAuth is a great framework but the difficulty and wide range of implementation makes it painful to use and tend to slow down the ability to integrate with new APIs.

_But seriously, why Pizzly? We're fan of bears and fell in love with this [sweet hybrid](https://en.wikipedia.org/wiki/Grizzly–polar_bear_hybrid) one 🐻_

## How it works?

You can use Pizzly as a **complete API proxy**, it means that each API request will go through the service. Pizzly forwards each request to the third-party API using a config file, it authenticates each request with the right `access_token` and handles token refreshness if needed. Pizzly is also available as a standalone **OAuth manager**, helping you to retrieve the initial token, but you'll have to refresh it when needed. _(see Getting Started below)_.

![Diagram of Pizzly used in the proxy service mode](views/assets/img/docs/pizzly-diagram-api-proxy-mode.jpg?raw=true)

![Diagram of Pizzly used in the token manager mode](views/assets/img/docs/pizzly-diagram-token-manager-mode.jpg?raw=true)

### Understanding the\*\* **AuthId concept**

It's important to understand the AuthId concept behind Pizzly. The AuthId is an identifier masking OAuth tokens. Since most OAuth tokens need to be refreshed, and therefore will change, but still represent a common identity _(especially a user identity when performing 3-legged OAuth),_ the AuthId serve as an abstraction layer. To say it differently, an AuthId represents an identity that will have many tokens overtime.

## Key Features

- Manage retrieving, storing and refreshing OAuth tokens _(aka the OAuth dance)_
- No scopes limitation
- Retrieve and store complete OAuth payload
- Support of OAuth 1, Oauth 1a and OAuth 2.0
- JavaScript library to connect from your web-app (three-legged OAuth flow)
- Provide configurations for over 50+ OAuth APIs (see list below)
- Support adding new OAuth APIs using a file definition
- 1-click deploy to Heroku or major cloud hosting solution

## Installation

At the heart of Pizzly is a Node.js application that uses PostgreSQL as a database. It straightforward to install on Heroku using the **Deploy to Heroku** button, but you can install it anywhere.

### Manual Install\*\*

To run Pizzly on your machine, follow these steps:

```bash
git clone https://github.com/Bearer/Pizzly
cd pizzly
yarn install
yarn prepare
yarn start
```

Then open the dashboard in your browser at

```
http://localhost:8080/
```

You will need Node.js and PostgreSQL installed first. Read our [getting started](https://github.com/Bearer/Pizzly/wiki/Getting-started) to follow a step-by-step installation guide.

### Heroku Install\*\*

Deploy it to Heroku and test it.

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy?template=https://github.com/Bearer/Pizzly)

Once deployed, go to the heroku application and connect to an API.

## Getting Started

**Using Pizzly as a complete API proxy**

Follow this step-by-step guide on [how to use Pizzly as a proxy service](https://github.com/Bearer/Pizzly/wiki/TODO) and learn how to:

1. Save a configuration for an API (with clientId/clientSecret and scopes)
2. Initiate the OAuth dance to retrieve a token
3. Call the third-party API
4. Retrieve data from that API

**Using Pizzly as an OAuth manager**

Follow a step-by-step guide on [how to use Pizzly as an OAuth manager](https://github.com/Bearer/Pizzly/wiki/TODO) and learn how to:

1. Save a configuration for an API (with clientId/clientSecret and scopes)
2. Initiate the OAuth dance to retrieve a token
3. Use Pizzly's API to retrieve the OAuth payload (e.g. `access_token`, `refresh_token`, etc.)

> If you're looking to monitor, track performance, detect anomalies to your API requests, have a look to [Bearer.sh](https://bearer.sh/?ref=pizzly), the monitoring agent. If you're using Pizzly in API proxy mode, it's as simple as adding your Bearer Developer Key to the environment variable `$BEARER_AGENT_KEY` - you can [get yours for free](https://bearer.sh/?ref=pizzly) here 🚀

## Supported APIs

More than 50 APIs are preconfigured to work out-of-the-box. Including: GitHub, Salesforce, Facebook, Google Sheets, Gmail, LinkedIn, Typeform, Zoom, [and more...](/integrations) Each API consists of a JSON configuration file, stored within the `/integrations` directory.

Here's an example with the GitHub configuration file (`/integration/github.json`):

```json
{
  "name": "GitHub",
  "config": {
    "authorizationURL": "https://github.com/login/oauth/authorize",
    "tokenURL": "https://github.com/login/oauth/access_token",
    "authType": "OAUTH2",
    "tokenParams": {},
    "authorizationParams": {},
    "config": { "accessType": "offline", "scope": [] }
  },
  "request": {
    "baseURL": "https://api.github.com",
    "headers": {
      "Accept": "application/vnd.github.v3+json",
      "Authorization": "token ${auth.accessToken}",
      "User-Agent": "Pizzly"
    }
  }
}
```

To add a new API, just create a new configuration file. Here's a step-by-step guide on [how to create a new configuration file](https://github.com/Bearer/Pizzly/wiki/TODO).

## License

This project is licensed under the terms of the MIT license. See the [LICENSE file](LICENSE.md) for more information.
