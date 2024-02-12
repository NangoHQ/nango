# Contributes

To create an extension or run Nango locally: [check our documentation](https://docs.nango.dev/contribute)

## Develop locally

To develop on the platform locally follow those steps:

```sh
git clone https://github.com/NangoHQ/nango.git
```

Install the project

```sh
npm run install:all
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

To know more about the CLI, check the [documentation](https://docs.nango.dev/sdks/cli).
