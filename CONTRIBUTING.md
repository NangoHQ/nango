# Contributes

You can run Nango locally with Docker ([step-by-step guide](https://docs.nango.dev/host/self-host/local)), contribute an API ([step-by-step guide](https://docs.nango.dev/customize/guides/contribute-an-api)) and contribute an integration template ([step-by-step guide](https://docs.nango.dev/contribute-an-integration-template)).

## Develop locally

To develop on the platform locally follow those steps:

```sh
git clone https://github.com/NangoHQ/nango.git
```

Install the project

```sh
npm i
```

Install Frontend Dependencies

```sh
cd packages/frontend
npm i
cd -
```

Set your envs

```sh
cp .env.example .env
```

Launch the databases and queue

```sh
npm run dev:docker
```

Launch Nango

```sh
# In two different shell
npm run dev:watch
npm run dev:watch:apps
```

Go to [http://localhost:3000](http://localhost:3000)

## Run integrations

Start by creating a folder that will contains your integrations

```sh
mkdir nango-integrations
cd nango-integrations
```

Install the CLI

```sh
npm i -g nango
```

```sh
nango init
```

Change the .env file `NANGO_SECRET_KEY_DEV` and `NANGO_HOSTPORT`.

```sh
NANGO_SECRET_KEY_DEV="secret key from nango dashboard"
NANGO_HOSTPORT="host:port"   # can be https://nango.dev or if running locally http://.localhost:3000
```

And deploy your changes

```sh
nango deploy dev
```

To know more about the CLI, check the [documentation](https://docs.nango.dev/reference/cli).

## Proposing pull requests

Pull Request title should follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
