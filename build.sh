#!/usr/bin/env bash
set -o errexit

pip install --upgrade pip
pip install --only-binary :all: -r requirements.txt