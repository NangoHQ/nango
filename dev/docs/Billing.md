# How to test and use Billing, Usage and Plans

## Setup

### Plans

Plans configuration are stored in `plans` table. You'll need:

- `FLAG_PLAN_ENABLED=true` in your .env
- Insert a row for your account if you don't have one yet

Definitions are in `packages/shared/lib/services/plans/definitions.ts`

### Usage

Usage is powered by Orb. You'll need:

- Go to Orb
- Activate test mode
- Grab an api key for you
- Go to webhooks and grab the signing secret
- Put everything in .env

```sh
FLAG_USAGE_ENABLED=true
ORB_API_KEY=
ORB_WEBHOOKS_SECRET=
```

Once activated you should see usage in Orb.
You'll need to create a customer in Orb if you don't have one yet.

### Billing

Billing is powered by Stripe (money collection only). The plan and invoices are managed by Orb.

To enable money collection you'll need:

- Go to Stripe
- Activate test mode
- Go to developers
- Grab your secret key and webhooks key,publishable key (public key)

```sh
STRIPE_SECRET_KEY=
STRIPE_WEBHOOKS_SECRET=
PUBLIC_STRIPE_KEY=
```

## Testing UI

- Forward Orb webhooks.
  /!\ You'll need to add/update an entry in Orb UI

```sh
lt --port 3003
```

- Forward Stripe webhooks

```sh
stripe listen --load-from-webhooks-api --forward-to localhost:3003
```

- Go to ui <http://localhost:3003/dev>
