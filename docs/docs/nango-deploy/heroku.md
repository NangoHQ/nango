# Deploy Nango to Heroku

Deploy your own hosted Nango instance with Heroku:

<a href="https://heroku.com/deploy?template=https://github.com/NangoHQ/nango-heroku">
  <img src="https://www.herokucdn.com/deploy/button.svg" alt="Deploy to heroku" width="200"/>
</a>

### Deployment Information

The Heroku template generates a dedicated Nango Server instance as well as a separate Postgres database.

Heroku no longer has a free tier, so using this template requires that you set up your payment information in your Heroku account. This template uses the lowest tier ($7/month for the server, $5/month for the database).

The Nango server will not work right away after you deploy the app on Heroku. You need to set 2 environment variables in your Heroku app settings:

-   `NANGO_SERVER_URL`: the full URL of your Heroku app (or your custom domain)
-   `NANGO_DATABASE_URL`: the value for the `DATABASE_URL` Heroku config var, to which you should append `?sslmode=no-verify` (i.e. `<DATABASE_URL>?sslmode=no-verify`)

Finally, you should restart the app and it will work.

You do not need to set the `SERVER_PORT` environment variable.

:::info
Your should read the [self-hosting instructions](./oss-instructions.md) before deploying to production.
:::
