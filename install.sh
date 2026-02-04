#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "   _____ _                          "
echo "  / ____| |                         "
echo " | |    | |__   ___  _ __ _   _ ___ "
echo " | |    | '_ \ / _ \| '__| | | / __|"
echo " | |____| | | | (_) | |  | |_| \__ \\"
echo "  \_____|_| |_|\___/|_|   \__,_|___/"
echo -e "${NC}"
echo "Run multiple AI coding sessions in parallel"
echo ""

# Check dependencies
check_dependency() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}✗ $1 is not installed${NC}"
        return 1
    else
        echo -e "${GREEN}✓ $1 found${NC}"
        return 0
    fi
}

echo "Checking dependencies..."
MISSING=0

check_dependency "git" || MISSING=1
check_dependency "node" || MISSING=1
check_dependency "cargo" || MISSING=1

# Check for bun or npm
if command -v bun &> /dev/null; then
    PKG_MANAGER="bun"
    echo -e "${GREEN}✓ bun found${NC}"
elif command -v npm &> /dev/null; then
    PKG_MANAGER="npm"
    echo -e "${GREEN}✓ npm found${NC}"
else
    echo -e "${RED}✗ Neither bun nor npm found${NC}"
    MISSING=1
fi

if [ $MISSING -eq 1 ]; then
    echo ""
    echo -e "${RED}Please install missing dependencies:${NC}"
    echo "  - Node.js: https://nodejs.org/"
    echo "  - Rust: https://rustup.rs/"
    echo "  - Bun (optional): https://bun.sh/"
    exit 1
fi

echo ""

# Install location
INSTALL_DIR="$HOME/.chorus"

if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Chorus is already installed at $INSTALL_DIR${NC}"
    read -p "Do you want to update it? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Updating Chorus..."
        cd "$INSTALL_DIR"
        git pull
    else
        echo "Aborted."
        exit 0
    fi
else
    echo "Installing Chorus to $INSTALL_DIR..."
    git clone https://github.com/VentureIA/Chorus.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

echo ""
echo "Installing dependencies..."
if [ "$PKG_MANAGER" = "bun" ]; then
    bun install
else
    npm install
fi

echo ""
echo "Building MCP server..."
cargo build --release -p chorus-mcp-server

echo ""
echo "Building Chorus app..."
if [ "$PKG_MANAGER" = "bun" ]; then
    bun run tauri build
else
    npm run tauri build
fi

echo ""

# Find and install the built app
if [[ "$OSTYPE" == "darwin"* ]]; then
    APP_PATH=$(find target -name "Chorus.app" -type d | head -1)
    if [ -n "$APP_PATH" ]; then
        echo "Installing Chorus.app to /Applications..."
        rm -rf /Applications/Chorus.app 2>/dev/null || true
        cp -R "$APP_PATH" /Applications/
        echo -e "${GREEN}✓ Chorus installed to /Applications/Chorus.app${NC}"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    APPIMAGE_PATH=$(find target -name "*.AppImage" | head -1)
    if [ -n "$APPIMAGE_PATH" ]; then
        mkdir -p "$HOME/.local/bin"
        cp "$APPIMAGE_PATH" "$HOME/.local/bin/chorus"
        chmod +x "$HOME/.local/bin/chorus"
        echo -e "${GREEN}✓ Chorus installed to ~/.local/bin/chorus${NC}"
    fi
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║      Chorus installed successfully!    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo "To launch Chorus:"
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  open /Applications/Chorus.app"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "  chorus"
fi
echo ""
echo "To update later:"
echo "  cd ~/.chorus && git pull && bun run tauri build"
echo ""
