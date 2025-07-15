# Billing, usage and plans

## 🤓 How it works?
<!--
shape: sequence_diagram
User1 -> Nango: I want to upgrade to Starter
Nango -> User1: Give us a credit card first
User1 -> Stripe: Save payment info
User1 -> Nango: I want to upgrade to Starter
Nango -> Orb: Schedule an upgrade to Starter for User1
Orb -> Nango: Here is a future SubscriptionID and a prorated invoice
Nango -> Stripe: User1 needs to pay <prorated>
Stripe -> Nango: (webhook) Payment succeeded
Nango -> Orb: User1 paid for SubscriptionID, apply the change
Orb -> Nango: (webhook) Plan changed
Nango -> User1: Success
-->
<img width="2096" height="2636" src="https://github.com/user-attachments/assets/a270bd2f-0522-4de6-b149-fcb0e25aa0b3" />

- Payments are saved in Stripe
- Usage is stored in Orb
- When we upgrade
  - We plan a change to Orb
  - Pay the flat fee in Stripe so we can confirm the card
  - Apply the change in Orb
- When we downgrade
  - Switch the plan in Orb

---

## 🧪 Setup to test

### Plans

Plans configurations are stored in `plans` table. You'll need:

- `FLAG_PLAN_ENABLED=true` in your .env
- Insert a row for your account if you don't have one yet

Definitions are in `packages/shared/lib/services/plans/definitions.ts`

### Usage

Usage is powered by Orb. You'll need:

- Go to Orb
- Activate test mode
- Grab an API Key for you
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
- Grab your secret key and webhooks key + publishable key (public key)
  You can get the webhooks key when you forward the webhooks

```sh
STRIPE_SECRET_KEY=
STRIPE_WEBHOOKS_SECRET=
PUBLIC_STRIPE_KEY=
```

### Final step

- Forward Orb webhooks.
  /!\ You'll need to add/update an entry in Orb UI

```sh
lt --port 3003
```

- Forward Stripe webhooks

```sh
stripe listen --load-from-webhooks-api --forward-to localhost:3003
```

- Go to UI <http://localhost:3000/dev>
