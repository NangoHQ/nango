# Contribution Guidelines

To support a new API, simply ask the Nango team to add it with fast turnaround (2-5 days) on the [community](https://nango.dev/slack).

For contributions, please [submit an issue](https://github.com/NangoHQ/nango/issues) describing your intent to contribute with details about your problem & solution. We will get back to you within 24h. Once we aligned & your change is approved by a team member, you can start implementing the change and submit a PR.

# Contributing

You can run Nango locally with Docker ([step-by-step guide](https://docs.nango.dev/guides/self-hosting/free-self-hosting/locally)) and contribute an API ([step-by-step guide](https://docs.nango.dev/guides/new-api-support)).

## Develop locally

To develop on the platform locally follow those steps:

```sh
git clone https://github.com/NangoHQ/nango.git
```

Install the project

```sh
npm i
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
And deploy your changes

```sh
nango deploy dev
```

To know more about the CLI, check the [documentation](https://docs.nango.dev/reference/cli).

## Proposing pull requests

Pull Request title should follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
