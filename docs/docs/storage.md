# Storage & Logs 

### Storage

Nango stores developer and user credentials in a Postgres database of your choosing, in a Postgres schema called `nango`. 

If running the [Quickstart](quickstart.md) with `docker compose up`, Nango will automatically generate a new Postgres database for faster experimentation.

You can specify which database Nango should use by modifying the environment variables in the `.env` files at the root of the Nango folder.

### Logs

When you run Nango locally with docker compose you can view the logs in real-time with this command:
```
docker compose logs --follow
```

By default, Nango logs info-level messages and above. You can make logs more verbose by setting `LOG_LEVEL` to `debug` (or less verbose by setting it to `error`) in the `.env` file.