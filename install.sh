#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    OS="windows"
fi

# Check if command exists
has_cmd() {
    command -v "$1" &> /dev/null
}

# Install a dependency
install_dep() {
    local name=$1
    local install_cmd=$2

    echo -e "${YELLOW}Installing $name...${NC}"
    eval "$install_cmd"

    if has_cmd "$name"; then
        echo -e "${GREEN}✓ $name installed successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to install $name${NC}"
        return 1
    fi
}

# Check and install dependencies
echo "Checking dependencies..."
echo ""

MISSING=()

# Check Git
if has_cmd git; then
    echo -e "${GREEN}✓${NC} git $(git --version | cut -d' ' -f3)"
else
    echo -e "${RED}✗${NC} git not found"
    MISSING+=("git")
fi

# Check Node.js
if has_cmd node; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} node $NODE_VERSION"
else
    echo -e "${RED}✗${NC} node not found"
    MISSING+=("node")
fi

# Check Rust/Cargo
if has_cmd cargo; then
    CARGO_VERSION=$(cargo --version | cut -d' ' -f2)
    echo -e "${GREEN}✓${NC} cargo $CARGO_VERSION"
else
    echo -e "${RED}✗${NC} rust/cargo not found"
    MISSING+=("rust")
fi

# Check for bun or npm
PKG_MANAGER=""
if has_cmd bun; then
    PKG_MANAGER="bun"
    echo -e "${GREEN}✓${NC} bun $(bun --version)"
elif has_cmd npm; then
    PKG_MANAGER="npm"
    echo -e "${GREEN}✓${NC} npm $(npm --version)"
else
    echo -e "${YELLOW}!${NC} neither bun nor npm found (will use npm after node install)"
fi

echo ""

# Handle missing dependencies
if [ ${#MISSING[@]} -gt 0 ]; then
    echo -e "${YELLOW}Missing dependencies: ${MISSING[*]}${NC}"
    echo ""

    # Ask to install
    read -p "Do you want to install them automatically? [Y/n] " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        echo ""

        for dep in "${MISSING[@]}"; do
            case $dep in
                git)
                    case $OS in
                        macos)
                            if has_cmd brew; then
                                install_dep "git" "brew install git"
                            else
                                echo -e "${CYAN}Installing Xcode Command Line Tools (includes git)...${NC}"
                                xcode-select --install 2>/dev/null || true
                                echo -e "${YELLOW}Please complete the Xcode installation popup, then run this script again.${NC}"
                                exit 0
                            fi
                            ;;
                        linux)
                            if has_cmd apt-get; then
                                install_dep "git" "sudo apt-get update && sudo apt-get install -y git"
                            elif has_cmd dnf; then
                                install_dep "git" "sudo dnf install -y git"
                            elif has_cmd pacman; then
                                install_dep "git" "sudo pacman -S --noconfirm git"
                            else
                                echo -e "${RED}Cannot auto-install git. Please install manually.${NC}"
                                exit 1
                            fi
                            ;;
                    esac
                    ;;

                node)
                    echo -e "${CYAN}Installing Node.js via nvm (recommended)...${NC}"

                    # Install nvm if not present
                    if ! has_cmd nvm && [ ! -d "$HOME/.nvm" ]; then
                        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
                        export NVM_DIR="$HOME/.nvm"
                        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
                    else
                        export NVM_DIR="$HOME/.nvm"
                        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
                    fi

                    # Install latest LTS Node
                    nvm install --lts
                    nvm use --lts

                    if has_cmd node; then
                        echo -e "${GREEN}✓ Node.js installed: $(node --version)${NC}"
                        PKG_MANAGER="npm"
                    else
                        echo -e "${RED}Failed to install Node.js. Please install manually from https://nodejs.org${NC}"
                        exit 1
                    fi
                    ;;

                rust)
                    echo -e "${CYAN}Installing Rust via rustup...${NC}"
                    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
                    source "$HOME/.cargo/env"

                    if has_cmd cargo; then
                        echo -e "${GREEN}✓ Rust installed: $(rustc --version)${NC}"
                    else
                        echo -e "${RED}Failed to install Rust. Please install manually from https://rustup.rs${NC}"
                        exit 1
                    fi
                    ;;
            esac
        done

        echo ""
    else
        echo ""
        echo -e "${YELLOW}Please install the missing dependencies manually:${NC}"
        echo ""
        for dep in "${MISSING[@]}"; do
            case $dep in
                git)
                    echo "  Git: https://git-scm.com/downloads"
                    ;;
                node)
                    echo "  Node.js: https://nodejs.org/"
                    ;;
                rust)
                    echo "  Rust: https://rustup.rs/"
                    ;;
            esac
        done
        echo ""
        exit 1
    fi
fi

# Final check
if ! has_cmd git || ! has_cmd node || ! has_cmd cargo; then
    echo -e "${RED}Some dependencies are still missing. Please install them and try again.${NC}"
    exit 1
fi

# Ensure we have a package manager
if [ -z "$PKG_MANAGER" ]; then
    if has_cmd bun; then
        PKG_MANAGER="bun"
    elif has_cmd npm; then
        PKG_MANAGER="npm"
    else
        echo -e "${RED}No package manager found. Please install npm or bun.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}All dependencies are installed!${NC}"
echo ""

# Install location
INSTALL_DIR="$HOME/.chorus"

if [ -d "$INSTALL_DIR" ]; then
    echo -e "${CYAN}Chorus is already installed at $INSTALL_DIR${NC}"
    read -p "Update to latest version? [Y/n] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        echo "Updating Chorus..."
        cd "$INSTALL_DIR"
        git pull
    else
        echo "Aborted."
        exit 0
    fi
else
    echo "Cloning Chorus to $INSTALL_DIR..."
    git clone https://github.com/VentureIA/Chorus.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

echo ""
echo -e "${CYAN}Installing dependencies with $PKG_MANAGER...${NC}"
if [ "$PKG_MANAGER" = "bun" ]; then
    bun install
else
    npm ci
fi

echo ""
echo -e "${CYAN}Building MCP server...${NC}"
cargo build --release -p chorus-mcp-server

echo ""
echo -e "${CYAN}Building Chorus app (this may take a few minutes)...${NC}"
if [ "$PKG_MANAGER" = "bun" ]; then
    bun run tauri build
else
    npm run tauri build
fi

echo ""

# Find and install the built app
if [[ "$OS" == "macos" ]]; then
    APP_PATH=$(find target -name "Chorus.app" -type d 2>/dev/null | head -1)
    if [ -n "$APP_PATH" ]; then
        echo -e "${CYAN}Installing Chorus.app to /Applications...${NC}"
        rm -rf /Applications/Chorus.app 2>/dev/null || true
        cp -R "$APP_PATH" /Applications/
        echo -e "${GREEN}✓ Installed to /Applications/Chorus.app${NC}"
    fi
elif [[ "$OS" == "linux" ]]; then
    APPIMAGE_PATH=$(find target -name "*.AppImage" 2>/dev/null | head -1)
    if [ -n "$APPIMAGE_PATH" ]; then
        mkdir -p "$HOME/.local/bin"
        cp "$APPIMAGE_PATH" "$HOME/.local/bin/chorus"
        chmod +x "$HOME/.local/bin/chorus"
        echo -e "${GREEN}✓ Installed to ~/.local/bin/chorus${NC}"
    fi
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║      Chorus installed successfully!       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

if [[ "$OS" == "macos" ]]; then
    echo "Launch Chorus:"
    echo -e "  ${CYAN}open /Applications/Chorus.app${NC}"
    echo ""
    read -p "Open Chorus now? [Y/n] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        open /Applications/Chorus.app
    fi
elif [[ "$OS" == "linux" ]]; then
    echo "Launch Chorus:"
    echo -e "  ${CYAN}chorus${NC}"
fi

echo ""
echo "To update later:"
echo -e "  ${CYAN}cd ~/.chorus && git pull && $PKG_MANAGER run tauri build${NC}"
echo ""
