#!/bin/bash
# Chorus Status Hook
# Called by Claude Code hooks to report status to Chorus application
#
# The hook checks two sources for configuration:
# 1. Environment variables (CHORUS_STATUS_URL, CHORUS_SESSION_ID)
# 2. Session file in project directory (.chorus-session)

# Get state from first argument (working, idle, needs_input, etc.)
STATE="${1:-working}"
MESSAGE="${2:-}"

# Try to get config from environment first
STATUS_URL="$CHORUS_STATUS_URL"
SESSION_ID="$CHORUS_SESSION_ID"
INSTANCE_ID="$CHORUS_INSTANCE_ID"

# If not in environment, try to read from session file in current directory or parent dirs
if [ -z "$STATUS_URL" ]; then
    # Look for .chorus-session in current directory and parent directories
    DIR="$PWD"
    while [ "$DIR" != "/" ]; do
        if [ -f "$DIR/.chorus-session" ]; then
            source "$DIR/.chorus-session"
            break
        fi
        DIR=$(dirname "$DIR")
    done
fi

# Exit early if still no configuration found (not a Chorus session)
if [ -z "$STATUS_URL" ]; then
    exit 0
fi

# Build JSON payload
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
JSON_PAYLOAD=$(cat <<EOF
{
    "session_id": ${SESSION_ID:-0},
    "instance_id": "${INSTANCE_ID:-unknown}",
    "state": "$STATE",
    "message": "$MESSAGE",
    "timestamp": "$TIMESTAMP"
}
EOF
)

# Send to Chorus status server (non-blocking, ignore errors)
curl -s -X POST "$STATUS_URL" \
    -H "Content-Type: application/json" \
    -d "$JSON_PAYLOAD" \
    --max-time 1 \
    >/dev/null 2>&1 &

exit 0
