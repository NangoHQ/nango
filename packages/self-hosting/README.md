# @nangohq/self-hosting

One image, two modes. At Nango (`NANGO_CLOUD=true`) it is the registry of enterprise installations: customers, installations, their keys and the licenses we issued, in the `self_hosting` schema of the main database. Anywhere else it is the installation side.

## Licensing operations

Licenses are signed by the KMS key `alias/nango-license-signing` in the production account. The `nango-self-hosting` pod identity is the only workload allowed to sign with it, so every operation runs inside that pod with `kubectl exec`. Cluster access is the gate, nothing secret is passed as an argument, and every command prints one JSON document to stdout.

```bash
alias nango-registry='kubectl --context production -n nango exec deploy/nango-self-hosting -c self-hosting -- node packages/self-hosting/dist/cli.js'
```

The walkthroughs below assume that alias. Dates are ISO 8601. `grace_until` is the date after which an expired installation stops starting once the boot check enforces; today the check only warns, on every state. An installation is named with the `installation_id` of its tfvars in nango-infra, `byoc-<customer>-<stage>` as in [altruist/staging.tfvars](https://github.com/NangoHQ/nango-infra/blob/40e3a3a17741b8847da050feaf3b0ca2c455531a/terraform/customers/byoc/aws/environments/altruist/staging.tfvars#L2), which is also the `env` tag its pods report to Datadog. `--alerts` takes the same value as the `alerts` of those tfvars, defined in [variables.tf](https://github.com/NangoHQ/nango-infra/blob/40e3a3a17741b8847da050feaf3b0ca2c455531a/terraform/customers/byoc/aws/variables.tf#L473): `oncall` pages through BetterStack and posts to Slack, `slack` posts only, `off` does neither and is the default. A self-managed installation is not in our Datadog, so it stays `off`.

### Destructive commands: dry run first

`customer delete`, `installation delete`, `key delete` and `license disable` change nothing unless `--yes` is given. Without it they run in preview mode: they print what the command would soft-delete or deactivate, as JSON on stdout, and exit 1. Run the command without `--yes`, read the preview, then run it again with `--yes`.

```bash
nango-registry installation delete --installation <uuid>
{
  "installation": { "uuid": "…", "name": "byoc-acme-prod" },
  "keys": ["<kid>"],
  "activeLicense": "2027-11-05T00:00:00.000Z"
}
nothing changed, re-run with --yes to proceed
```

For `customer delete` the preview holds that block for each live installation of the customer. Every delete is soft: customers, installations and keys keep a `deleted_at`, and licenses are never deleted, only deactivated, so the registry keeps the full history and a wrong delete is recoverable by hand. `--all` on `customer list`, `installation list` and `key list` includes the deleted rows, and `license list` shows every license ever issued for an installation, active or not.

### Onboarding a new customer

```bash
nango-registry customer create --name acme
nango-registry installation create --customer acme --name byoc-acme-prod --mode byoc --stage production
nango-registry key create --installation <uuid from the previous output>
nango-registry license create --installation <uuid> --expires-at 2027-11-05T00:00:00Z --grace-until 2028-02-03T00:00:00Z
```

Hand over two values, out of band: the `license` from the last output as `NANGO_LICENSE` (the `row` next to it is the registry record), and the key's `kid` and `privateKeyPem` from `key create` (how they travel as `NANGO_INSTALLATION_PRIVATE_KEY` is settled with the installation tokens). Paste both into the customer's 1Password item and delete any local copy; the private key is printed once and never stored on our side.

### Adding an installation to an existing customer

Same as above without `customer create`. Add `--stage staging` or `--stage development` as fits, `--no-telemetry` if the contract excludes telemetry, `--alerts slack` or `--alerts oncall` to match its tfvars.

```bash
nango-registry installation create --customer acme --name byoc-acme-staging --mode byoc --stage staging --alerts slack
nango-registry key create --installation <uuid>
nango-registry license create --installation <uuid> --expires-at 2027-11-05T00:00:00Z --grace-until 2028-02-03T00:00:00Z
```

### Renewing a license

One command. It replaces the active license and keeps the previous one in the table, inactive. The customer rolls `NANGO_LICENSE` to the new value and restarts the server; nothing else changes on their side.

```bash
nango-registry installation list --customer acme
nango-registry license create --installation <uuid> --expires-at 2028-11-05T00:00:00Z --grace-until 2029-02-03T00:00:00Z
```

### Changing what an installation is entitled to

`installation update` edits the registry row; the license still carries the old values until the next `license create`, so renew right after. Mode and stage change in place too, so a customer moving between BYOC and self-managed keeps its uuid, keys and license; moving to self-managed needs `--alerts off` in the same command when alerts were on.

```bash
nango-registry installation update --installation <uuid> --no-telemetry
nango-registry license create --installation <uuid> --expires-at 2027-11-05T00:00:00Z --grace-until 2028-02-03T00:00:00Z
```

### Moving an installation between BYOC and self-managed

It has happened: a customer left BYOC for a cluster they run themselves. The installation keeps its identity, so the customer keeps `NANGO_LICENSE` and the installation key as they are; only the registry row changes. Alerts go `off` in the same command, since the new cluster is not in our Datadog.

```bash
nango-registry installation update --installation <uuid> --mode self_managed --alerts off
```

The reverse move is `--mode byoc` with the `--alerts` value from the new tfvars. Nothing is re-minted either way, the license carries no mode; the infrastructure teardown or provisioning is handled in nango-infra and nango-environments as usual.

### Rotating an installation key

On the customer's request or a suspected leak. Both keys verify while the customer rolls the secret; delete the old one once they confirm. On a confirmed compromise delete first, uploads fail until the new key is in place.

```bash
nango-registry key create --installation <uuid>
nango-registry key list --installation <uuid>
nango-registry key delete --kid <old kid> --yes
```

### Revoking a license

Deactivates the current license: uploads and export files are refused from then on, and the server logs it as unlicensed at its next start. A revoked license never comes back; to license the installation again, issue a new one with `license create` and have the customer set it.

```bash
nango-registry license disable --installation <uuid> --yes
```

### Decommissioning

Deleting an installation deactivates its license and deletes its keys in the same transaction; its name becomes free again. Deleting a customer does the same for every installation it still has, so offboarding is one command; the preview lists them.

```bash
nango-registry installation delete --installation <uuid> --yes
nango-registry customer delete --name acme --yes
```

### Command reference

| Command               | Options                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customer create`     | `--name <name>`                                                                                                                                         |
| `customer list`       | `[--all]`                                                                                                                                               |
| `customer delete`     | `--name <name> [--yes]`                                                                                                                                 |
| `installation create` | `--customer <name> --name <name> --mode byoc\|self_managed --stage production\|staging\|development [--no-telemetry] [--alerts off\|slack\|oncall]`     |
| `installation update` | `--installation <uuid> [--name <name>] [--mode byoc\|self_managed] [--stage production\|staging\|development] [--telemetry\|--no-telemetry] [--alerts]` |
| `installation delete` | `--installation <uuid> [--yes]`                                                                                                                         |
| `installation list`   | `[--customer <name>] [--all]`                                                                                                                           |
| `key create`          | `--installation <uuid>`                                                                                                                                 |
| `key delete`          | `--kid <kid> [--yes]`                                                                                                                                   |
| `key list`            | `--installation <uuid> [--all]`                                                                                                                         |
| `license create`      | `--installation <uuid> --expires-at <iso date> --grace-until <iso date>`                                                                                |
| `license disable`     | `--installation <uuid> [--yes]`                                                                                                                         |
| `license list`        | `--installation <uuid>`                                                                                                                                 |

The four commands with `[--yes]` apply the change only with it. Without it they exit 1 and print what they would touch: for `installation delete` the installation, its live keys and the active license, for `customer delete` that for each of its live installations, for `key delete` the key id, for `license disable` the installation and the active license.

### Locally

Point `NANGO_SELF_HOSTING_DATABASE_URL` at a database with the schema and run `node packages/self-hosting/dist/cli.js` with an AWS profile that can sign with the development key. Licenses signed there only verify on images built with that key, never on a managed image.
