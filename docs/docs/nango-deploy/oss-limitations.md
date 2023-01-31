# Limitations of Nango Open Source

To keep the setup of the Nango open source version simple we have made some choices that may not be ideal for production. Please take them into consideration before using it in production: 
- The database is bundled in the docker container with transient storage. This means that updating the Docker image causes configs/credentials loss. We recommend that you connect Nango to a production DB that lives outside the docker setup to mitigate this.
- Credentials are not encrypted at rest and stored in plain text
- No authentication by default
- No SSL setup by default
- The setup is not optimized for scaling
- Updating the provider templates requires an update of the docker containers

These limitations do not apply to [Nango Cloud](cloud.md).