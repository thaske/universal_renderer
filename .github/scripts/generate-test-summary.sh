#!/bin/bash

# Generate test summary for GitHub Actions
# Usage: ./generate-test-summary.sh <ruby_result> <npm_result> <integration_result>

set -e

RUBY_RESULT=${1:-"unknown"}
NPM_RESULT=${2:-"unknown"}
INTEGRATION_RESULT=${3:-"unknown"}

# Function to get status emoji and text
get_status() {
  if [ "$1" == "success" ]; then
    echo "✅ Passed"
  else
    echo "❌ Failed"
  fi
}

# Generate the summary
cat << EOF >> $GITHUB_STEP_SUMMARY
# 🧪 Test Results Summary

## 📊 Test Coverage Overview

| Test Suite             | Status                              |
|------------------------|-------------------------------------|
| Ruby Gem Unit Tests    | $(get_status "$RUBY_RESULT")        |
| NPM Package Unit Tests | $(get_status "$NPM_RESULT")         |
| Integration Tests      | $(get_status "$INTEGRATION_RESULT") |

## 🔧 Matrix Testing

- **Ruby versions**: 3.2, 3.3
- **Bun versions**: 1.2.1, 1.2.7, latest

## 📋 Test Types Executed

- **Unit Tests**: Individual module testing
- **Integration Tests**: HTTP contract validation
- **End-to-End Tests**: Ruby gem ↔ NPM package communication
- **Performance Tests**: Concurrent request handling
- **Error Scenario Tests**: Edge case and malformed request handling
EOF
