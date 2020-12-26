There are probably as many ways of using Pizzly than there are API. You'll find in this page different examples, with the most used API that we have heard of. If you wish to add a new example, please take into account the learning curve.

All examples below use the GitHub API for ease of use. But all concepts are applicable to any API previously configured in your Pizzly instance.

## Examples

- [Examples](#examples)
- [Connect to an API](#connect-to-an-api)
- [Perform a GET request](#perform-a-get-request)
- [Perform a PUT request](#perform-a-put-request)
- [Live demos](#live-demos)
<!--
- [Make an API request with extra params](#make-an-api-request-with-extra-params)
- [Retrieve the OAuth Payload](#retrieve-the-oauth-payload-frontend) _from your frontend_
- [Retrieve the OAuth Payload](#retrieve-the-oauth-payload-backend) _from your backend_
  -->

## Connect to an API

To perform requests to an API and access data from a user (e.g. its profile), you first need to connect to the API. Connecting, in Pizzly, means triggering an OAuth dance where the user authorize your application to perform some requests.

In this example, we will connect ourself to GitHub. But first, you'll need to [create a GitHub OAuth application](https://developer.github.com/apps/building-oauth-apps/creating-an-oauth-app/). Then configure the GitHub API in your Pizzly instance (all examples in this page require the `user` scope).

1. Install the pizzly-js package in your frontend application:

   ```bash
   npm install pizzly-js
   ```

   or with the `<script>` tag:

   ```html
   <script src="https://cdn.jsdelivr.net/npm/pizzly-js@latest/dist/index.umd.min.js"></script>
   ```

2. Use this code to trigger a connect to GitHub:

   ```js
   const pizzly = new Pizzly({ host: 'x-replace-with-your-pizzly-instance.example.org' })
   const github = pizzly.integration('github')

   github
     .connect()
     .then(({ authId }) => console.log('Connected!', authId))
     .catch((error) => console.error('It failed!', error))
   ```

Running this example in your browser will open a popup that points to the authorization modal of GitHub. From there the user can authorize your application. On success, you retrieve an [`authId`](/auth.md#the-authid-concept) to perform requests to that API.

## Perform a GET request

In Node.js, assuming that you've successfully [connected to the GitHub API](#connect-to-an-api), you can perform a `GET` request to any endpoint by using the following code.

1. First install `pizzly-node` in your Node.js app:

   ```bash
   npm install pizzly-node
   ```

2. Then copy/paste the code below in your Node.js app to perform the request:

   ```js
   const Pizzly = require('pizzly-node')
   const pizzly = new Pizzly({ host: 'x-replace-with-your-pizzly-instance.example.org' })

   const github = pizzly.integration('github')

   github
     .auth('x-auth-id') // Replace with a valid authId
     .get('/user')
     .then((response) => console.log(response))
     .catch(console.error)
   ```

   Note that you'll need a valid `authId` to authorize the request.

Not using Node.js? You can achieve a similar result using cURL:

```bash
curl -X GET "https://x-replace-with-your-pizzly-instance.example.org/proxy/github/user" \
  -H "Pizzly-Auth-Id: x-auth-id"
```

## Perform a PUT request

The GitHub API provides an handy endpoint to star a repository for the authenticated user. Let's see how to use it with Pizzly:

1. First, connect the user and make sure you've retrieved its `authId`;
2. In a Node.js app, use the following code to perform the request:

   ```js
   github
     .auth('x-auth-id') // Replace with a valid authId
     .put('/user/starred/bearer/pizzly')
     .then((response) => console.log(response))
     .catch(console.error)
   ```

   This snippet will make the authenticated user to star [Bearer/Pizzly](https://github.com/Bearer/Pizzly).

Again, in cURL, you can achieve the same result:

```bash
curl -X PUT "https://x-replace-with-your-pizzly-instance.example.org/proxy/github/user/starred/bearer/pizzly" \
  -H "Pizzly-Auth-Id: x-auth-id"
```

## Live demos

Below is a list of projects or live demos made the Pizzly community 🐻 :

- [How to use an OAuth based API in Vue.js](https://dev.to/bearer/how-to-use-an-oauth-based-api-in-vue-js-1elo)
- [Fetch your GitHub profile](https://codesandbox.io/s/pizzly-github-react-demo-rq78z)
- [Fetch your Reddit profile](https://codesandbox.io/s/pizzly-reddit-react-demo-qzu3e?file=/src/App.js)
- [Save a table to Google Sheet](https://codepen.io/frenchcooc/pen/MWKbQqj)

Have something you're proud of? Feel free to update the list.

<!--
## Perform a request with extra params

_TODO_

## Retrieve the OAuth Payload (frontend)

_TODO_

## Retrieve the OAuth Payload (backend)

_TODO_
-->
