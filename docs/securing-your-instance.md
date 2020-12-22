By default, your Pizzly's instance does not require an authentication method to access its data. It's great for local development but not recommended if you plan to use it with production data.

In this guide, you will learn how to secure your Pizzly instance.

## Environment variables

Pizzly use environment variables to restrict access to the instance. Here's short overview

| Name               | Services protected |
| ------------------ | ------------------ |
| DASHBOARD_USERNAME | Dashboard          |
| DASHBOARD_PASSWORD | Dashboard          |
| SECRET_KEY         | API, Proxy         |
| PUBLISHABLE_KEY    | Auth, Proxy        |

### DASHBOARD_USERNAME

Your Pizzly dashboard can be protected behind a username & password, using the Basic access authentication method. `DASHBOARD_USERNAME` is the username.

### DASHBOARD_PASSWORD

Your Pizzly dashboard can be protected behind a username & password, using the Basic access authentication method. `DASHBOARD_PASSWORD` is the password.

Once both are set, your browser will prompt an authorization window:

<img src="https://user-images.githubusercontent.com/3255133/81276046-c977a180-9052-11ea-846b-d7190381c803.png" alt="Authentication prompt to access the dashboard" width="500"/>

### SECRET_KEY

Your `SECRET_KEY` should be kept confidential and only stored on your own servers. Your account’s secret API key can perform any request to the `API` and `Proxy` services, without restriction.

Once set, authenticate requests to your Pizzly instance by using a basic authorization method and provide the `SECRET_KEY` as username (without password):

```bash
curl -X GET "/api/"
  -u "$SECRET_KEY:"
```

### PUBLISHABLE_KEY

Your `PUBLISHABLE_KEY` isn’t secret and shouldn't be considered as is. Publishable keys only have the power to make `auth` & `proxy` requests. And requests to the `proxy` service can be deactivated ([learn more](#disallow-frontend-requests-to-the-proxy-service)).

## Securing Pizzly on a PaaS (Heroku, Platform.sh, etc.)

Most PaaS provides guides on how to configure environments variables on their platform:

- Heroku ([Configuration and Config Vars](https://devcenter.heroku.com/articles/config-vars))
- Platform.sh ([Variables](https://docs.platform.sh/development/variables.html))

## Securing Pizzly with `.envrc`

If you have SSH access to your server, you can use a configuration file.

1. In the root directory of your Pizzly project, open the `.envrc` file. If you don't have one, you can copy the `.envrc.example` file with this command: `cp .envrc.example .envrc`

2. In that file, heads to the "Secure" section. It should look something similar to this:

   ```bash
   #
   # Secure your instance
   #
   # 1. Secure access to the dashboard
   #
   export DASHBOARD_USER=""
   export DASHBOARD_PASSWORD=""
   #
   # 2. Secure requests to the API
   #
   export SECRET_KEY=""
   export PUBLISHABLE_KEY=""
   ```

3. Update each environment variables with new values. Make sure to generate unguessable keys. A password manager can help a lot here.
4. Accept the changes with:

   ```bash
   direnv allow
   ```

5. Restart your server for the changes to take effect. Locally, you will have to enter:

   ```bash
   yarn build && yarn start
   ```

6. Redeploy your instance

## Extra options

### Enable Bearer

Bearer.sh provides an agent that can monitor and shield your Pizzly instance from API failures. For example, the agent will automatically retry a request that fails due to a network issue. You can create your own rules and be alerted when something goes wrong by email and more.

To enable Bearer, follow these steps:

1. [Create an account on Bearer.sh](https://www.bearer.sh/), it's free.
2. Retrieve your secret key [here](https://app.bearer.sh/settings/key).
3. Update the following environment variable:

   ```bash
   BEARER_SECRET_KEY="..."
   ```

4. Restart or redeploy your instance. On most PaaS (e.g. Heroku), the instance is automatically restarted when you update an environment variables.

Each API request will be logged in your Bearer's dashboard, with monitoring, graphs and more. Please note that some features require a paid account.

### Disallow frontend requests to the proxy service

Pizzly's proxy accepts requests having a valid `publishableKey`. This means that someone that knows your `publishableKey` can query an API using your Pizzly's instance.

As the key is publicly available on your frontend, this might feel unsecure, but remind that the `publishableKey` is used only to authenticate the request with Pizzly. An attacker would need both a valid `publishableKey` and a valid `authId` to make request to a third-party API.

Still, if you aren't feeling safe to accept frontend requests, you can easily refuse them.

1. Go to your host configuration settings or open your configuration file (`.envrc`) config file
2. Set the following environment variable to "TRUE":

   ```bash
   PROXY_USES_SECRET_KEY_ONLY=TRUE
   ```

3. Restart or redeploy your instance. On most PaaS (e.g. Heroku), the instance is automatically restarted when you update an environment variables.

## What's next?

Now that your Pizzly instance is secured, here are a few guides that might be helpful:

- [Look at more examples](/docs/examples.md)
- [API Authentication schema](/docs/API.md#authentication)
