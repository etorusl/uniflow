#!/bin/sh
set -eu

# Keep the host credential file owner-only. The image drops to uid 1000, so
# prepare a separate owner-only copy in container memory before its entrypoint.
mkdir -p /run/uniflow
cp /run/secrets/uniflow-s3.json /run/uniflow/s3.json
chown seaweed:seaweed /run/uniflow /run/uniflow/s3.json
chmod 700 /run/uniflow
chmod 400 /run/uniflow/s3.json
exec /entrypoint.sh "$@"
