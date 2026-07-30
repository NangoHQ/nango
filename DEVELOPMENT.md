# Development setup

## Develop locally

Clone the repository and install dependencies:

```sh
git clone https://github.com/NangoHQ/nango.git
cd nango
npm install
npm run prepare
```

Create your environment file:

```sh
cp .env.example .env
```

Start the databases and queue:

```sh
npm run dev:docker
```

Run Nango in two separate terminals:

```sh
npm run dev:watch
```

```sh
npm run dev:watch:apps
```

Open [http://localhost:3000](http://localhost:3000).

## Run integrations

Create a directory for your integrations and install the CLI:

```sh
mkdir nango-integrations
cd nango-integrations
npm install --global nango
nango init
```

Set `NANGO_SECRET_KEY_DEV` and `NANGO_HOSTPORT` in `.env`, then deploy:

```sh
nango deploy dev
```

See the [CLI documentation](https://nango.dev/docs/reference/functions/functions-cli) for more information.
