#!/bin/bash

for INTEGRATION in $(ls integration-templates); do
    bash ./scripts/generate-integration-template-tests.bash $INTEGRATION
done
