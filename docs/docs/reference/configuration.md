# Advanced configuration

### CLI Host & Port

By default, the CLI uses the host/port `http://localhost:3003` to call the Nango server. You can customize this by setting the environment variable named `NANGO_HOSTPORT` in your CLI environment, using a `.bashrc` or `.zshrc` file.

Learn more about the [Nango CLI](cli).

### Dynamic OAuth URLs (Shopify & Zendesk) {#connection-config}

Certain APIs have dynamic OAuth URLs.

For example, Zendesk has the following authorization URL, where the subdomain is specific to a user's Zendesk account:
```
https://[USER-SUBDOMAIN].zendesk.com/oauth/authorizations/new
```

Shopify has the same setup: `https://[STORE-SUBDOMAIN].myshopify.com/admin/oauth/authorize`.

To use Nango with these provider you have to tell it the subdomain when calling `nango.auth(...)` in your frontend:
```javascript
// For Zendesk replace 'shopify' with 'zendesk'
// This assumes that your provider config key is set to 'shopify'/'zendesk'
nango.auth('shopify', '<connection-id>', { params: { subdomain: '<shopify-subdomain>'}})
```

Nango will then build the correct authorization URL before forwarding your user.

### Something not working as expected? Need help?
If you run into any trouble with Nango or have any questions please do not hesitate to contact us -  we are happy to help!

Please join our [Slack community](https://nango.dev/slack), where we are very active, and we will do our best to help you fast.