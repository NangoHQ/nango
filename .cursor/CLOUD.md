## Cursor Cloud specific instructions

### Services overview

Nango is a monorepo with microservices. See `.agents/skills/running-and-testing-locally/SKILL.md` for full startup details. Key service URLs: webapp `:3000`, server `:3003`, orchestrator `:3008`, connect-ui `:3009`.

### Docker in Cloud VM

Docker requires extra setup in the Cursor Cloud VM (fuse-overlayfs storage driver, iptables-legacy, manual `dockerd` start). After installing Docker:

```bash
sudo mkdir -p /etc/docker
printf '{\n  "storage-driver": "fuse-overlayfs"\n}' | sudo tee /etc/docker/daemon.json
sudo update-alternatives --set iptables /usr/sbin/iptables-legacy
sudo update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy
sudo dockerd &>/tmp/dockerd.log &
sleep 3
sudo chmod 666 /var/run/docker.sock
```

Elasticsearch may fail to start from `docker compose` due to cgroup/ulimits. Run it without resource limits:
```bash
docker rm -f elasticsearch 2>/dev/null
docker run -d --name elasticsearch --network dev_nango -p 9500:9200 -e "discovery.type=single-node" -e "xpack.security.enabled=false" elasticsearch:8.13.0
```

### ESLint memory

Running `npm run lint` on the full repo requires `NODE_OPTIONS="--max-old-space-size=8192"` due to the monorepo size. Linting individual packages works without extra memory.

### Running tests

- Unit tests: `npm run test:unit -- --run` (no Docker dependency)
- Integration tests: `npm run test:integration` (requires Docker for testcontainers)
- See `.agents/skills/running-tests/SKILL.md` for details.

### Test credentials

When signing up locally, use: name `Test User`, email `test@nango.dev`, password `TestPassword123!`. Verification URL is logged to server stdout (prefix `(EmailClient)`).

### Orchestrator/Metering crashes

The orchestrator may crash with advisory lock errors on first start. Restarting usually fixes it. The metering service crashes without `CLICKHOUSE_URL` set — this is safe to ignore for most dev workflows.
