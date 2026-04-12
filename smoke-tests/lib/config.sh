#!/usr/bin/env bash
# Shared constants for smoke tests.
# Sourced by each test script and by the runner.

GITHUB_REPO="ameshdev/amesh"
NPM_SCOPE="@authmesh"
NPM_PACKAGES=(core keystore sdk cli relay)
RELAY_PORT=3001

# Set by the runner at invocation time
# VERSION       — e.g. "0.5.0"
# RELAY_URL     — e.g. "ws://amesh-smoke-relay:3001/ws"
# RELAY_HEALTH  — e.g. "http://amesh-smoke-relay:3001/health"
