This tutorial is intended for those interested in consuming OAuth based APIs, such as engineers and web developers, and how Pizzly makes it faster to integrate with a pre-configured list of APIs.

## Objectives

- Running Pizzly locally
- Connect yourself to GitHub
- Retrieve your GitHub `accessToken`
- Make an authenticated request to GitHub API

## Prerequisites

- Having a GitHub account ([signup here, it's free](https://github.com/join))
- [Node.js & npm installed](https://nodejs.dev/how-to-install-nodejs)
- [Download, install, and run PostgreSQL](https://www.postgresql.org/download/)

## Running Pizzly on your machine

1. Download the [Pizzly source code](https://github.com/Bearer/Pizzly):

   ```bash
   git clone https://github.com/Bearer/Pizzly
   ```

2. Change to the directory:

   ```bash
   cd pizzly
   ```

3. Install dependencies for the project (you can also use `npm`):

   ```bash
   yarn install
   ```

4. Setup the database. Pizzly uses PostgreSQL. If you don't have it yet, you will need to [install it first](https://www.postgresql.org/docs/9.3/tutorial-install.html).

   ```bash
   yarn db:setup
   ```

   _Tip: Pizzly uses the default PostgreSQL's user (`username=postgresql` and `password=` <empty string>). If you are using another user or password, copy the `.envrc.example` file to `.envrc` and update the following environment variables `DB_PASSWORD` and `DB_USER`._

5. Start the local server:

   ```bash
   yarn start
   ```

6. View app in your browser by opening:

   ```
   http://localhost:8080/
   ```

## Connect yourself to GitHub

1. On GitHub, [create an OAuth application](https://github.com/settings/applications/new).
2. Make sure to register the following URL as the **Authorization callback URL**:

   ```
   http://localhost:8080/auth/callback
   ```

3. Open Pizzly dashboard and select the GitHub API, or access it directly through the following URL:

   ```
   http://localhost:8080/dashboard/github
   ```

4. Click on "New Configuration" and input the following information:

   1. Use the "Client ID" / "Client Secret" provided by GitHub when creating an OAuth Application.
   2. For the `scopes` field, enter `user`.
   3. Save the form to save the credentials in the database.

5. Click the "Connect to GitHub" button, or open the following page in your browser and click on "Connect to GitHub":

   ```
   http://localhost:8080/dashboard/github/authentications/connect
   ```

_Tip: when you want to connect your users to an API, you don't need to repeat all these steps. Only the last one, "Connect to GitHub", is required. To learn more on how to connect users on your application, read the Pizzly's connect guide(Coming soon...)._

## Retrieve your GitHub `accessToken`

When you connected to your GitHub account, Pizzly created an `authId`. It's a reference that Pizzly uses to retrieve the OAuth payload, including the `accessToken`. Let's see how to retrieve the information associated with your `authId`.

1. Grab the `authId` from step #5 in the previous section. It's something similar to:

```
9170f2c0-8957-11ea-ad33-0bc14197b007
```

2. Retrieve the OAuth payload with the following command:

```bash
curl http://localhost:8080/api/github/authentications/REPLACE-WITH-YOUR-AUTH-ID
```

3. The response should look something similar to:

```json
{
  "id": "9170f2c0-8957-11ea-ad33-0bc14197b007",
  "object": "authentication",
  "auth_id": "9170f2c0-8957-11ea-ad33-0bc14197b007",
  "payload": {
    "connectParams": {},
    "serviceName": "github",
    "userId": "9170f2c0-8957-11ea-ad33-0bc14197b007",
    "updatedAt": 1588081979214,
    "accessToken": "d7eexxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "refreshToken": "non",
    "idToken": "non",
    "expiresIn": 0,
    "scopes": [],
    "tokenResponseJSON": "...",
    "callbackParamsJSON": "..."
  },
  "created_at": "2020-04-28T13:52:59.218Z",
  "updated_at": "2020-04-28T13:52:59.218Z"
}
```

## Make an authenticated request to GitHub

<!--The example below uses Node.js, as it's the main language of Pizzly, but the concept is applicable to any programming language.

```javascript
const axios = require('axios')

const PIZZLY_INSTANCE = 'http://localhost:8080'
const authId = 'REPLACE-WITH-YOUR-AUTH-ID'

// 1. Fetch the OAuth payload for the provided authId
axios
  .get(PIZZLY_INSTANCE + '/api/github/authentications/' + authId)
  .then(({ data }) => {
    const { accessToken } = data.payload

    // 2. Fetch authenticated user's profile on GitHub
    return axios
      .get('https://api.github.com/user', {
        headers: { Authorization: 'token ' + accessToken }
      })
      .then(({ data }) => console.log(data))
      .catch(console.error)
  })
  .catch(console.error)
```

This snippet does two requests:

1. First, it fetches the OAuth payload from Pizzly to retrieve the `accessToken`;
2. Then, it makes an authenticated request to GitHub using that `accessToken`.


To reduce the number of requests, your Pizzly instance can work as a proxy. Here's an example (in Node.js again):
-->

Retrieve your GitHub profile information by running this cURL command:

```bash
curl -X GET http://localhost:8080/proxy/github/user \
 -H "Pizzly-Auth-Id: REPLACE-WITH-YOUR-AUTH-ID"
```

From your application's point of view, this snippet does one request directly to the Pizzly instance. Behind the scenes, here's what's happening:

1. Pizzly receives the request and queries the database to retrieve the user's `accessToken`.
2. It uses the `accessToken` to make an authenticated request to the GitHub API.
3. Finally, it sends the response back to your application.

There are two main benefits of using Pizzly as a proxy:

- If needed, Pizzly will automatically refresh the token before requesting the third-party API's resource.
- You can use the [Pizzly's JS](/src/clients/javascript) client to query APIs right from your frontend.

## What's next?

- [See more examples](/docs/examples.md)
- Install Pizzly on the cloud(Coming soon...)
- [Secure your instance](/docs/securing-your-instance.md)
- [Learn more about Pizzly's API](/docs/API.md)
