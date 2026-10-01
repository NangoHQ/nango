# wrap-dek

Wraps the Nango global DEK (`NANGO_ENCRYPTION_KEY`) with a KMS master key, producing the value for `NANGO_ENCRYPTION_KEY_WRAPPED`. With `--decrypt`, it unwraps an existing value so you can check it.

It loads the keyrings from `packages/kms`, so run it inside a Nango checkout after `npm install` at the repo root. The commands below run from the repo root.

## Pick the master key

Pass exactly one of the following. Use the same value at runtime, in the environment variable listed.

| Provider        | Flag             | Runtime variable         | Value                                                                            |
| --------------- | ---------------- | ------------------------ | -------------------------------------------------------------------------------- |
| AWS KMS         | `--key-arn`      | `NANGO_KMS_KEY_ARN`      | `arn:aws:kms:REGION:ACCOUNT:key/ID`                                              |
| GCP Cloud KMS   | `--gcp-key-name` | `NANGO_GCP_KMS_KEY_NAME` | `projects/PROJECT/locations/LOCATION/keyRings/RING/cryptoKeys/KEY`               |
| Azure Key Vault | `--azure-key-id` | `NANGO_AZURE_KMS_KEY_ID` | `https://VAULT.vault.azure.net/keys/NAME/VERSION` (an RSA key, with its version) |

Credentials come from your environment:

- **AWS:** the default AWS credential chain. You need `kms:GenerateDataKey` to wrap and `kms:Decrypt` to verify.
- **GCP:** Application Default Credentials, with `roles/cloudkms.cryptoKeyEncrypterDecrypter` on the key. To act as a service account, also set `GOOGLE_IMPERSONATE_SERVICE_ACCOUNT=SA@PROJECT.iam.gserviceaccount.com`; your own account then needs `roles/iam.serviceAccountTokenCreator` on it.
- **Azure:** `DefaultAzureCredential` (for example after `az login`), with **Key Vault Crypto User** on the key.

## Playbook

The examples use AWS. For GCP or Azure, swap `--key-arn "$KEY"` for `--gcp-key-name "$KEY"` or `--azure-key-id "$KEY"`.

The DEK is read from stdin so it never lands on disk or in shell history.

**1. Wrap**

```sh
echo -n "$NANGO_ENCRYPTION_KEY" | npx tsx scripts/wrap-dek/wrap-dek.ts --key-arn "$KEY" \
  --context purpose=global_dek --context app=nango > dek-wrapped.b64
```

Nango rejects a wrapped DEK unless its context includes `purpose=global_dek` and `app=nango`.

**2. Verify the round trip**

```sh
[ "$(npx tsx scripts/wrap-dek/wrap-dek.ts --decrypt --key-arn "$KEY" \
  --context purpose=global_dek --context app=nango < dek-wrapped.b64)" = "$NANGO_ENCRYPTION_KEY" ] && echo OK
```

**3. Deploy**

Set `NANGO_ENCRYPTION_KEY_WRAPPED` to the contents of `dek-wrapped.b64`, set the runtime variable for your provider, and remove `NANGO_ENCRYPTION_KEY`. Nango refuses to start when both are set. Then delete `dek-wrapped.b64`.

## Troubleshooting

If you ran `npm install` inside `scripts/wrap-dek` before it used the monorepo install, delete `scripts/wrap-dek/node_modules`. A leftover copy of the Encryption SDK there makes the keyring fail.
