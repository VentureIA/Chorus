#!/bin/bash
# Install Chorus status hooks into Claude Code settings
# This script adds hooks that report Claude's state to Chorus when running inside Chorus sessions

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SCRIPT="$SCRIPT_DIR/chorus-status-hook.sh"
SETTINGS_FILE="$HOME/.claude/settings.json"

# Check if settings file exists
if [ ! -f "$SETTINGS_FILE" ]; then
    echo "Error: Claude Code settings file not found at $SETTINGS_FILE"
    echo "Please run Claude Code at least once to create the settings file."
    exit 1
fi

# Check if hook script exists
if [ ! -f "$HOOK_SCRIPT" ]; then
    echo "Error: Hook script not found at $HOOK_SCRIPT"
    exit 1
fi

# Make hook script executable
chmod +x "$HOOK_SCRIPT"

echo "Installing Chorus status hooks..."
echo "Hook script: $HOOK_SCRIPT"
echo "Settings file: $SETTINGS_FILE"

# Use node/bun to modify the JSON safely
if command -v bun &> /dev/null; then
    NODE_CMD="bun"
elif command -v node &> /dev/null; then
    NODE_CMD="node"
else
    echo "Error: Node.js or Bun is required to run this installer"
    exit 1
fi

# Create a temporary JS script to modify settings
TEMP_SCRIPT=$(mktemp)
cat > "$TEMP_SCRIPT" << 'NODEJS_SCRIPT'
const fs = require('fs');
const path = require('path');

const settingsFile = process.argv[2];
const hookScript = process.argv[3];

// Read current settings
let settings;
try {
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
} catch (err) {
    console.error('Failed to parse settings file:', err.message);
    process.exit(1);
}

// Initialize hooks object if it doesn't exist
if (!settings.hooks) {
    settings.hooks = {};
}

// Define Chorus hooks
const chorusHooks = {
    PreToolUse: {
        matcher: "",
        hooks: [{
            type: "command",
            command: `${hookScript} working "Using tool"`
        }]
    },
    Stop: {
        matcher: "",
        hooks: [{
            type: "command",
            command: `${hookScript} idle "Ready"`
        }]
    },
    Notification: {
        matcher: "",
        hooks: [{
            type: "command",
            command: `${hookScript} needs_input "Waiting for input"`
        }]
    }
};

// Add or update Chorus hooks
for (const [hookType, hookConfig] of Object.entries(chorusHooks)) {
    if (!settings.hooks[hookType]) {
        settings.hooks[hookType] = [];
    }

    // Check if Chorus hook already exists
    const existingIndex = settings.hooks[hookType].findIndex(h =>
        h.hooks && h.hooks.some(cmd => cmd.command && cmd.command.includes('chorus-status-hook'))
    );

    if (existingIndex !== -1) {
        // Update existing hook
        settings.hooks[hookType][existingIndex] = hookConfig;
        console.log(`Updated existing ${hookType} hook`);
    } else {
        // Add new hook
        settings.hooks[hookType].push(hookConfig);
        console.log(`Added new ${hookType} hook`);
    }
}

// Write updated settings
try {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    console.log('\nHooks installed successfully!');
} catch (err) {
    console.error('Failed to write settings file:', err.message);
    process.exit(1);
}
NODEJS_SCRIPT

# Run the installer script
$NODE_CMD "$TEMP_SCRIPT" "$SETTINGS_FILE" "$HOOK_SCRIPT"

# Cleanup
rm -f "$TEMP_SCRIPT"

echo ""
echo "Done! Chorus status hooks are now installed."
echo "The hooks will only send status updates when running inside Chorus (CHORUS_STATUS_URL is set)."
echo ""
echo "To uninstall, manually remove the Chorus hooks from ~/.claude/settings.json"
