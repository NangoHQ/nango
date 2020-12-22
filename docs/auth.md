Pizzly helps developers handle OAuth-dances with ease. If you are not sure what an OAuth-dance is or if you're curious about how Pizzly make it easy, read on.

## What is OAuth?

The concept of OAuth take us back to 2007. The idea was to propose a more secure way of letting a third-party application having access to users data. Let's take Google for example, which has billions of users, and is wondering how to grant third-party applications a secure way to access its users' data.

Before OAuth, the most common way was to share user's password with the third-party application! This was extremely unsecure and let applications having full access on the account.

OAuth changed that by introducing an authorization layer to both secure the access without sharing any password and gives granularity to what the application has access to. No need to share password anymore. Now a user grant access with a few clicks.

![Google's Authorization URL](https://developers.google.com/identity/protocols/oauth2/images/examples/scope-authorization.png)

But the OAuth authentication method is not just one core concept, it consists of a variety of frameworks, including:

- [the legacy OAuth 1.0 and 1.a frameworks](https://oauth.net/1/)
- [the industry-standard OAuth 2.0 framework](https://oauth.net/2/),

and multiple "grant types" that works for different use cases:

- [Authorization Code](https://oauth.net/2/grant-types/authorization-code/)
- [Client Credentials](https://oauth.net/2/grant-types/client-credentials/)
- [Device Code](https://oauth.net/2/grant-types/device-code/)
- [Refresh Token](https://oauth.net/2/grant-types/refresh-token/)

On top of that, the implementation may vary from one API to the other.

By introducing a new and secure authentication method, that provides an excellent user exprience (UX), we didn't really think about the developer experience (DX).

## What makes Pizzly easier?

Pizzly acts as an OAuth manager that focus on the developer in three ways:

1. First, [it provides dozens of API configurations](/docs/supported-apis.md), so a developer can setup a new integration in a few minutes.
2. Second, it already works with OAuth 1.0, 1.a, OAuth 2.0 and most common grant types.
3. Third, it's completely transparent for the end-user and adds no change to the UX.

To take an example, one of the most common OAuth flow (i.e. the authorization code grant type) works - in a simplified way - as follow:

- the developer starts the OAuth-dance;
- the user grants access;
- the service (e.g. Google, Facebook, etc.) provides unique credentials;
- the developer saves the OAuth payload, especially the `access_token` and `refresh_token`;
- when needed, the developer needs to refresh the `access_token`.

With the [Pizzly JS library](/Bearer/Pizzly/tree/master/src/clients/javascript), handling an OAuth dance from A to Z takes a few lines of code:

```js
const pizzly = new Pizzly() // Initialize Pizzly
const github = pizzly.integration('github') // Target the GitHub Integration

github
  .connect() // Trigger an OAuth-dance with GitHub.
  .then({ authId } => { console.log(authId) }) // Output the Pizzly authId
  .catch(console.error) // Handle erro
```

From a developer's perspective, Pizzly eases the flow by:

- handling on its own the OAuth-dance from A to Z (as well as the refreshing the token);
- providing to the developer the payload as well as an `authId`.

## The `authId` concept

It's important to understand the `authId` concept that Pizzly introduces. When performing an OAuth-dance with Pizzly, the JS library returns an `authId`:

```js
// Trigger an OAuth-dance with GitHub.
github
  .connect()
  .then({ authId } => { console.log(authId) })
```

The `authId` acts an identifier masking the OAuth payload. It's a reference to both the `access_token` and the `refresh_token`. In fact, Pizzly provides an endpoint to receive the OAuth payload of an `authId`. But where the `authId` is really powerful is when using Pizzly's proxy mode.

## `authId` + proxy mode

The concept of `authId` is extremely useful when using Pizzly in its proxy mode. To perfom authenticated requests to an API, without Pizzly, you would need to handle the OAuth-flow, determine the `baseURL` and the endpoint to use and pass parameters alongside an `access_token`. Pizzly ease that process with a few lines of code:

```js
// Perform an authenticated GET request to GitHub
const response = await pizzly.integration('github').auth('replace-with-a-valid-auth-id').get('/user')
```

What's even better here, is that by using the `authId` Pizzly will handle the token refreshes. While most OAuth tokens need to be refreshed, and therefore will change, the `authId` is stable and unique. To say it differently, an `authId` represents an identity that will have many tokens overtime.

## How to configure a new integration?

To make sure Pizzly works well and can help your engineering team, you need to configure your integration with Pizzly. Let's see what steps are required for [any single of the supported APIs](/docs/supported-apis.md).

### Create an OAuth application

On the API developer's website, you'll first need to create an application. Some API call it an "OAuth application" which is more precise, but it's the same. Here are a few links on where to create an OAuth application:

- For GitHub, [open your developer settings](https://github.com/settings/developers)
- For Google APIs, head to the [Google Cloud Console](console.cloud.google.com/) > API > Credentials
- For Slack, [open your apps in the Slack API](https://api.slack.com/apps)

_Websites change and a link might be broken. Feel free to edit the page if you spot something wrong._

### Register your callback URL

OAuth require a callback URL to process the authorization flow from A to Z. The callback URL is where the API provider will redirect a user when it has granted access (or not) to your application. As Pizzly is self-hosted, your instance of Pizzly has a different callback URL from another developer.

To know you very own callback URL, follow these steps:

1. Open your Pizzly Dashboard;
2. Select an API (for example the GitHub API);
3. Click on the "New configuration" button;
4. In the form, you should see something like this:

   ```
   Tip: If needed, here's the callback URL to use:

   https://my-pizzly-instance.example.org/auth/callback
   ```

   That's your callback URL!

Most APIs will require that you register your callback URL alongside creating an OAuth application.

### Save your configuration into Pizzly

Now that you have created an OAuth application and registered your callback URL, the API will generate custom credentials to your app.

- For an OAuth 2.0 based API, the credentials are called **Client ID** and **Client Secret**
- For an OAuth 1.0 and 1.a based API, these credentials are called **Consumer Key** and **Consumer Secret**

You need to save these credentials on your Pizzly instance, by following these steps:

1. Open your Pizzly Dashboard;
2. Select an API (for example the GitHub API);
3. Click on the "New configuration" button;
4. In the form, copy/paste the credentials where asked;
5. Last but not least, be sure to provide a scope depending on your usage of the API.
