# @nangohq/self-hosting

One image, two modes. At Nango (`NANGO_CLOUD=true`) it is the registry of enterprise installations: customers, installations, their keys and the licenses we issued, in the `self_hosting` schema of the main database. Anywhere else it is the installation side.

## Licensing operations

Licenses are signed by the KMS key `alias/nango-license-signing` in the production account. The `nango-self-hosting` pod identity is the only workload allowed to sign with it, so every operation runs inside that pod with `kubectl exec`. Cluster access is the gate, nothing secret is passed as an argument, and every command prints one JSON document to stdout. The four destructive commands, `delete-customer`, `delete-installation`, `delete-key` and `disable-license`, need `--yes`; without it they are a dry run that prints everything the cascade would touch and changes nothing. Deletes are soft: the rows keep a `deleted_at`, and licenses are never deleted, only deactivated.

```bash
alias nango-registry='kubectl --context production -n nango exec deploy/nango-self-hosting -- node dist/cli.js'
```

The walkthroughs below assume that alias. Dates are ISO 8601; the grace period is the time after expiry during which the installation keeps starting.

### Onboarding a new customer

```bash
nango-registry create-customer --name acme
nango-registry create-installation --customer acme --name acme/prod --mode byoc --stage production
nango-registry create-key --installation <uuid from the previous output>
nango-registry create-license --installation <uuid> --expires-at 2027-11-05T00:00:00Z --grace-until 2028-02-03T00:00:00Z
```

Hand over two values, out of band: the `license` from the last output as `NANGO_LICENSE`, and the key's `kid` and `privateKeyPem` from `create-key` (how they travel as `NANGO_INSTALLATION_PRIVATE_KEY` is settled with the installation tokens). Paste both into the customer's 1Password item and delete any local copy; the private key is printed once and never stored on our side.

### Adding an installation to an existing customer

Same as above without `create-customer`. Add `--stage staging` or `--stage development` as fits, `--no-telemetry` if the contract excludes telemetry, `--alerts slack` or `--alerts oncall` to match the installation's Datadog tag.

```bash
nango-registry create-installation --customer acme --name acme/staging --mode byoc --stage staging --alerts slack
nango-registry create-key --installation <uuid>
nango-registry create-license --installation <uuid> --expires-at 2027-11-05T00:00:00Z --grace-until 2028-02-03T00:00:00Z
```

### Renewing a license

One command. It replaces the active license and keeps the previous one in the table, inactive. The customer rolls `NANGO_LICENSE` to the new value and restarts the server; nothing else changes on their side.

```bash
nango-registry list-installations --customer acme
nango-registry create-license --installation <uuid> --expires-at 2028-11-05T00:00:00Z --grace-until 2029-02-03T00:00:00Z
```

### Changing what an installation is entitled to

`update-installation` edits the registry row; the license still carries the old values until the next `create-license`, so renew right after.

```bash
nango-registry update-installation --installation <uuid> --no-telemetry
nango-registry create-license --installation <uuid> --expires-at 2027-11-05T00:00:00Z --grace-until 2028-02-03T00:00:00Z
```

### Rotating an installation key

On the customer's request or a suspected leak. Both keys verify while the customer rolls the secret; delete the old one once they confirm. On a confirmed compromise delete first, uploads fail until the new key is in place.

```bash
nango-registry create-key --installation <uuid>
nango-registry list-keys --installation <uuid>
nango-registry delete-key --kid <old kid> --yes
```

### Revoking a license

Uploads and export files are refused from then on. `create-license` reinstates.

```bash
nango-registry disable-license --installation <uuid> --yes
```

### Decommissioning

Deleting an installation deactivates its license and deletes its keys in the same transaction; its name becomes free again. Deleting a customer does the same for every installation it still has, so offboarding is one command; the preview lists them.

```bash
nango-registry delete-installation --installation <uuid> --yes
nango-registry delete-customer --name acme --yes
```

### Command reference

| Command               | Options                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `create-customer`     | `--name`                                                                                                                              |
| `delete-customer`     | `--name`                                                                                                                              |
| `create-installation` | `--customer --name --mode byoc\|self_managed --stage production\|staging\|development [--no-telemetry] [--alerts off\|slack\|oncall]` |
| `update-installation` | `--installation <uuid> [--name] [--telemetry\|--no-telemetry] [--alerts]`                                                             |
| `delete-installation` | `--installation <uuid>`                                                                                                               |
| `list-installations`  | `[--customer]`                                                                                                                        |
| `create-key`          | `--installation <uuid>`                                                                                                               |
| `delete-key`          | `--kid`                                                                                                                               |
| `list-keys`           | `--installation <uuid>`                                                                                                               |
| `create-license`      | `--installation <uuid> --expires-at <iso date> --grace-until <iso date>`                                                              |
| `disable-license`     | `--installation <uuid>`                                                                                                               |

### Locally

Point `NANGO_SELF_HOSTING_DATABASE_URL` at a database with the schema and run `node packages/self-hosting/dist/cli.js` with an AWS profile that can sign with the development key. Licenses signed there only verify on images built with that key, never on a managed image.
