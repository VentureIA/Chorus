#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}"
cat << 'EOF'
   _____ _
  / ____| |
 | |    | |__   ___  _ __ _   _ ___
 | |    | '_ \ / _ \| '__| | | / __|
 | |____| | | | (_) | |  | |_| \__ \
  \_____|_| |_|\___/|_|   \__,_|___/
EOF
echo -e "${NC}"

# Detect OS
OS="$(uname -s)"
case "$OS" in
    Darwin) PLATFORM="macos" ;;
    Linux)  PLATFORM="linux" ;;
    *)      echo -e "${RED}Unsupported OS: $OS${NC}"; exit 1 ;;
esac

# Installation method
install_from_release() {
    echo -e "${BLUE}Downloading Chorus...${NC}"

    if [ "$PLATFORM" = "macos" ]; then
        # Download the .app.zip
        DOWNLOAD_URL="https://github.com/VentureIA/Chorus/releases/latest/download/Chorus_universal.app.zip"
        TEMP_DIR=$(mktemp -d)

        curl -fsSL "$DOWNLOAD_URL" -o "$TEMP_DIR/Chorus.app.zip" || {
            echo -e "${RED}Download failed. Falling back to compilation...${NC}"
            install_from_source
            return
        }

        echo -e "${BLUE}Installing to /Applications...${NC}"
        unzip -q "$TEMP_DIR/Chorus.app.zip" -d "$TEMP_DIR"

        # Remove old version if exists
        [ -d "/Applications/Chorus.app" ] && rm -rf "/Applications/Chorus.app"

        # Move to Applications
        mv "$TEMP_DIR/Chorus.app" /Applications/

        # Remove quarantine attribute (bypass Gatekeeper)
        xattr -rd com.apple.quarantine /Applications/Chorus.app 2>/dev/null || true

        # Ad-hoc code sign so macOS TCC remembers folder permissions.
        # Without this, macOS asks for Desktop/Documents access on every launch.
        # With ad-hoc signing, permissions persist until the next app update.
        echo -e "${BLUE}Signing app for macOS permissions...${NC}"
        codesign --force --deep --sign - /Applications/Chorus.app 2>/dev/null || true

        # Cleanup
        rm -rf "$TEMP_DIR"

        echo -e "${GREEN}✓ Chorus installed to /Applications${NC}"

    elif [ "$PLATFORM" = "linux" ]; then
        # Download AppImage
        DOWNLOAD_URL="https://github.com/VentureIA/Chorus/releases/latest/download/chorus_amd64.AppImage"

        mkdir -p "$HOME/.local/bin"
        curl -fsSL "$DOWNLOAD_URL" -o "$HOME/.local/bin/chorus" || {
            echo -e "${RED}Download failed. Falling back to compilation...${NC}"
            install_from_source
            return
        }
        chmod +x "$HOME/.local/bin/chorus"

        echo -e "${GREEN}✓ Chorus installed to ~/.local/bin/chorus${NC}"
    fi
}

install_from_source() {
    INSTALL_DIR="$HOME/.chorus"

    # Check bun
    if ! command -v bun &> /dev/null; then
        echo -e "${YELLOW}Installing bun...${NC}"
        curl -fsSL https://bun.sh/install | bash
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"
    fi

    # Check rust
    if ! command -v cargo &> /dev/null; then
        echo -e "${YELLOW}Installing rust...${NC}"
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env"
    fi

    # Clone or update
    if [ -d "$INSTALL_DIR" ]; then
        echo -e "${BLUE}Updating Chorus...${NC}"
        cd "$INSTALL_DIR" && git pull
    else
        echo -e "${BLUE}Cloning Chorus...${NC}"
        git clone https://github.com/VentureIA/Chorus.git "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi

    # Install deps
    echo -e "${BLUE}Installing dependencies...${NC}"
    bun install

    # Build MCP server
    echo -e "${BLUE}Building MCP server...${NC}"
    cargo build --release -p chorus-mcp-server

    # Build the app
    echo -e "${BLUE}Building Chorus app (this may take 10-15 minutes)...${NC}"
    bun run tauri build

    # Install to /Applications
    echo -e "${BLUE}Installing to /Applications...${NC}"
    APP_PATH=$(find "$INSTALL_DIR/target" -name "Chorus.app" -type d | head -1)
    if [ -n "$APP_PATH" ]; then
        [ -d "/Applications/Chorus.app" ] && rm -rf "/Applications/Chorus.app"
        cp -R "$APP_PATH" /Applications/
        xattr -rd com.apple.quarantine /Applications/Chorus.app 2>/dev/null || true
        codesign --force --deep --sign - /Applications/Chorus.app 2>/dev/null || true
        echo -e "${GREEN}✓ Chorus installed to /Applications${NC}"
    else
        echo -e "${RED}Error: Could not find built app${NC}"
        exit 1
    fi
}

# Try download first, fall back to source if it fails
install_from_release

echo ""
echo -e "${GREEN}✓ Chorus installed!${NC}"
echo ""

if [ "$PLATFORM" = "macos" ]; then
    echo -e "Launch from: ${BLUE}/Applications/Chorus.app${NC}"
    echo -e "Or run: ${BLUE}open /Applications/Chorus.app${NC}"
    echo ""
    read -p "Launch Chorus now? [Y/n] " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Nn]$ ]] && open /Applications/Chorus.app
else
    echo -e "Run with: ${BLUE}chorus${NC}"
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        echo -e "${YELLOW}Add this to your shell config:${NC}"
        echo -e "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi
fi
