# CLI

You can manage your Provider Configurations & Connections using the Nango CLI. 

Run `npx nango` to get a list of all CLI commands.

## Setting the Nango host & secret key

By default, the CLI expects the Nango server to be reachable at `http://localhost:3003`. You can change this by setting the environment variable `NANGO_HOSTPORT` in your CLI environment.

If your instance is protected with a secret key (all Nango Cloud instances are, and hopefully your production instance is) you also need to set it with the `NANGO_SECRET_KEY` environment variable.

We recommend you store both in a `.bashrc` or `.zshrc` file:

```bash
export NANGO_HOSTPORT=https://nango<instance-id>.onrender.com;
export NANGO_SECRET_KEY=<secret-key>;
```

## Manage Provider Configurations

### List

Run `npx nango config:list` to list all existing Provider Configurations.

### Get

Run `npx nango config:get <provider_config_key>` to get a specific Provider Configurations.

### Create

Run `npx nango config:create <provider_config_key> <provider> <oauth_client_id> <oauth_client_secret> <oauth_scopes>` to create a new Provider Configuration. If you specify multiple OAuth scopes in `<oauth_scopes>` they should be separated by commas (e.g. `oauth,read`), regardless of what the instructions of the OAuth provider are (Nango will reformat them if needed).

### Edit

Run `npx nango config:edit <provider_config_key> <provider> <oauth_client_id> <oauth_client_secret> <oauth_scopes>` to edit an existing Provider Configuration. If you specify multiple OAuth scopes in `<oauth_scopes>` they should be separated by commas (e.g. `oauth,read`), regardless of what the instructions of the OAuth provider are (Nango will reformat them if needed).

### Delete

Run `npx nango config:delete <provider_config_key>` to delete an existing Provider Configuration.

## Manage Connections

### Get

Run `npx nango connection:get <connection_id> <provider_config_key>` to get a Connection with credentials. 