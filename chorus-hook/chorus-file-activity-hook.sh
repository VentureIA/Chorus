#!/bin/bash
# Chorus File Activity Hook
# PostToolUse hook for Edit/Write/MultiEdit — reports file activity to Chorus Intel Hub
# for automatic conflict detection between sessions.
#
# Receives tool info as JSON on stdin from Claude Code.
# If .chorus-session exists, reports the file edit to the /file-activity endpoint.
# If conflicts are detected, prints a warning to stderr (visible to Claude).

# Read tool info from stdin
input=$(cat)

# Extract file_path from tool_input (works for Write, Edit, MultiEdit)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
if [ -z "$file_path" ]; then
    exit 0
fi

# Try to get config from environment first
STATUS_URL="$CHORUS_STATUS_URL"
SESSION_ID="$CHORUS_SESSION_ID"
INSTANCE_ID="$CHORUS_INSTANCE_ID"

# If not in environment, try to read from session file
if [ -z "$STATUS_URL" ]; then
    DIR="$PWD"
    while [ "$DIR" != "/" ]; do
        if [ -f "$DIR/.chorus-session" ]; then
            source "$DIR/.chorus-session"
            break
        fi
        DIR=$(dirname "$DIR")
    done
fi

# Exit early if not a Chorus session
if [ -z "$STATUS_URL" ] || [ -z "$SESSION_ID" ] || [ -z "$INSTANCE_ID" ]; then
    exit 0
fi

# Derive base URL from status URL (strip /status suffix)
BASE_URL="${STATUS_URL%/status}"

# Report file activity and capture response for conflict detection
response=$(curl -s -X POST "$BASE_URL/file-activity" \
    -H "Content-Type: application/json" \
    -d "{\"session_id\": $SESSION_ID, \"instance_id\": \"$INSTANCE_ID\", \"file_path\": \"$file_path\", \"action\": \"editing\"}" \
    --max-time 2 2>/dev/null)

# Check for conflicts in response (non-empty JSON array)
if echo "$response" | jq -e 'length > 0' >/dev/null 2>&1; then
    # Extract conflicting session IDs (exclude our own)
    other_sessions=$(echo "$response" | jq -r ".[0].sessions | map(select(. != $SESSION_ID)) | join(\", \")" 2>/dev/null)
    if [ -n "$other_sessions" ] && [ "$other_sessions" != "" ]; then
        echo "WARNING: File '$file_path' is also being edited by session(s) $other_sessions. Coordinate to avoid conflicts." >&2
    fi
fi

exit 0
