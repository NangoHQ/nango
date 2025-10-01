# WIP

This WIP for the new public API is using:

- Fastify
Provides the API framework, openapi defs, validation, automatic routes based on file path

- fastify-type-provider-zod
Modify fastify to be compatible with Zod. We could be using openapi defs directly but it's easier to use and more portable.

- openapi-typescript
Transform openapi spec to types. Allows us to have portable types for frontend for example or SDK if we go with something manual.

- openapi-fetch
Gives us a type-fase client that takes openapi spec, nice for tests

- vitest
Classic setup



## Open API

Each endpoint contains the code and openapi spec.
Fastify doesn't provide a way to easily extrac the spec, so there is a little script here `scripts/generate-openapi-schema.ts` to output openapi.json

## What's missing / Questions

### Folder structure and auto generated path

The API endpoints are autoloaded from file. This has the drawbacks of adding slash at the end of the endpoints. Some like it some don't (I don't), depending on what you like you might want to fix that.
I chose a simple file naming strategy:
- list.ts/post.ts for GET /main_resources
- get.ts/put.ts/patch.ts/deleted.ts for /main_resources/:id

Feel free to change that.


### Middlewares type-safety

Could not figure out type-safety for chained middleware (e.g, auth) which requires us to check all values on each routes. This can be improved with utilities but ideally there is a way to do that, not sure.

### Rate limiting

It's probably going to be a similar setup to the express one

### CSP / security header

Same setup as express I believe

### Self hosted setup

Ideally we just do this in the entrypoint:
```bash
node "$dir/packages/server/dist/server.js" & 
node "$dir/packages/api-public/dist/app.js"
```

But I didn't get the time to test and see if everything would still work. I think the big issue is that it would use a different PORT so less ideal, but we already do that for the connect ui so it's just one more thing.
Alternatively we could load api-public in server and serve using the same port, not sure if possible.

### Connection ID header auth

Should be fairly straightforward, just adding a new middleware that check if secret -> env -> connection exists and add the connection to a decorator.


### Connect Session auth

It would be a different middleware (or a branch), we already do this in server so I don't think it will be much different.


### Response formatting

All endpoints should output a strict response. Ideally with a formatter so that it can be shared/tested/all in one place.
Wether or not there is formatter, ideally you list explicity all fields so that you don't leak stuff and typescript correctly report extra fields.
