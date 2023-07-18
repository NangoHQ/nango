import yaml
import json
import jsonschema
import sys

def validate(input_file, schema_file):
    with open(input_file, 'r') as f:
        data = yaml.safe_load(f)

    with open(schema_file, 'r') as f:
        schema = json.load(f)

    try:
        jsonschema.validate(data, schema)
    except jsonschema.exceptions.ValidationError as ve:
        print(ve)
        return False

    return True

if __name__ == "__main__":
    yaml_file = sys.argv[1]
    schema_file = './scripts/validation/providers/schema.json'
    if validate(yaml_file, schema_file):
        print("Validation successful.")
    else:
        print("Validation failed.")
        sys.exit(1)

