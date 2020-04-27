# Pizzly

## Installation

## Getting started

```
http://localhost:3000/auth/github?clientId=1
```

## API Reference

### Working with authentications

#### Retrieve an authentication

```
curl -X GET http://localhost:3000/api/github/authentications/

# Should return something like:
#
# {
#   "id": "....",
#   "object": "authentication",
#   "...": "..."
# }
#
```

#### Delete an authentication

```
curl -X DELETE http://localhost:3000/api/github/authentications/

# Should return something like:
#
# { "message": "Authentication removed" }
#
```

### Working with configurations

#### Save a new configuration

```
curl -X POST http://localhost:3000/api/github/configurations \
-H "Content-Type: application/json" \
-d '{"credentials": { "clientId": "...", "clientSecret": "..." }}'

# Should return something like:
#
# {
#   "message": "Configuration registered",
#   "configuration": {
#       "id": "....",
#       "object": "configuration",
#       "...": "..."
#   }
# }
#
```

### Retrieve a configuration

```
curl -X GET http://localhost:3000/api/github/configurations/72184458-7751-41fe-8dcc-0251ab2cc578

# Should return something like:
#
# {
#   "id": "....",
#   "object": "configuration",
#   "credentials": { "clientId": "...", "clientSecret": "..." }
#   "scopes": ["..."]
# }
#
```

### Update a configuration

```
curl -X PUT http://localhost:3000/api/github/configurations/72184458-7751-41fe-8dcc-0251ab2cc578 \
-H "Content-Type: application/json" \
-d '{"credentials": { "clientId": "new_id", "clientSecret": "..." }}'

# Should return something like:
#
# { "message": "Configuration updated" }
#
```

### Delete a configuration

```
curl -X DELETE http://localhost:3000/api/github/configurations/72184458-7751-41fe-8dcc-0251ab2cc578 \

# Should return something like:
#
# { "message": "Configuration removed" }
#
```

## Heroku

Deploy it to Heroku and test it.

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy?template=https://github.com/Bearer/Pizzly)

Once deployed, go to the heroku application and perform an API call.
