# @nangohq/self-hosting

One image, two modes. At Nango (`NANGO_CLOUD=true`) it is the registry of enterprise installations: customers, installations, their keys and the licenses we issued, in the `self_hosting` schema of the main database. Anywhere else it is the installation side.

## Licensing operations

Licenses are signed by the KMS key `alias/nango-license-signing` in the production account. The `nango-self-hosting` pod identity is the only workload allowed to sign with it, so every operation runs inside that pod with `kubectl exec`. Cluster access is the gate; nothing secret is passed as an argument.

Create an installation, its keypair and its first license:

```bash
kubectl -n nango exec deploy/nango-self-hosting -- node dist/cli.js create \
  --customer acme --name acme/prod --mode byoc --stage production \
  --expires-at 2027-11-05T00:00:00Z --grace-until 2028-02-03T00:00:00Z > acme-prod.json
```

The output is printed once: the installation (its `uuid` is what the license and the tokens carry), the license as a compact JWS, and the installation key as `kid` plus `privateKeyPem`. The private key is never stored; paste the file into the customer's 1Password item and delete it. The customer sets `NANGO_LICENSE` to the license; how `kid` and `privateKeyPem` travel as `NANGO_INSTALLATION_PRIVATE_KEY` is settled with the installation tokens.

Other commands, same shape:

| Command                                                      | Effect                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `renew --installation <uuid> --expires-at … --grace-until …` | New license from the current row; the previous one stays in the table, inactive      |
| `rotate-key --installation <uuid>`                           | Second keypair under the same installation; both verify until the old one is deleted |
| `delete-key --kid <kid>`                                     | Marks a key deleted; it stops verifying uploads                                      |
| `disable --installation <uuid>`                              | Deactivates the current license; uploads and exports are refused from then on        |

`--no-telemetry` and `--alerts off|slack|oncall` are accepted on `create`. Dates are ISO 8601.

Locally, point `NANGO_SELF_HOSTING_DATABASE_URL` at a database with the schema and run `node packages/self-hosting/dist/cli.js` with a profile that can sign with the development key; licenses signed there only verify on images built with that key, never on a managed image.
