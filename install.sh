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

# Build the app (skip DMG, just build the .app bundle)
echo -e "${BLUE}Building Chorus app...${NC}"
bun run tauri build -- --bundles app

# Install to /Applications
echo -e "${BLUE}Installing to /Applications...${NC}"
APP_PATH=$(find "$INSTALL_DIR/target" -name "Chorus.app" -type d | head -1)
if [ -n "$APP_PATH" ]; then
    # Remove old version if exists
    [ -d "/Applications/Chorus.app" ] && rm -rf "/Applications/Chorus.app"
    # Copy new version
    cp -R "$APP_PATH" /Applications/
    # Remove quarantine attribute
    xattr -rd com.apple.quarantine /Applications/Chorus.app 2>/dev/null || true
    echo -e "${GREEN}✓ Chorus installed to /Applications${NC}"
else
    echo -e "${RED}Error: Could not find built app${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✓ Chorus installed!${NC}"
echo ""
echo -e "Launch from: ${BLUE}/Applications/Chorus.app${NC}"
echo -e "Or run: ${BLUE}open /Applications/Chorus.app${NC}"
echo ""

read -p "Launch Chorus now? [Y/n] " -n 1 -r
echo
[[ ! $REPLY =~ ^[Nn]$ ]] && open /Applications/Chorus.app
