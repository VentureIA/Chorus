# Chorus

**Run multiple AI coding sessions in parallel**

Chorus is a desktop application that lets you orchestrate 1-6 AI coding assistants simultaneously, each working in its own isolated git worktree.

![macOS](https://img.shields.io/badge/macOS-13%2B-blue)
![Windows](https://img.shields.io/badge/Windows-10%2B-blue)
![Linux](https://img.shields.io/badge/Linux-supported-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## How It Works

Chorus solves the serial bottleneck of AI coding assistants. Instead of waiting for one task to finish before starting another, you run multiple sessions at once:

```
┌─────────────────────────────────────────────────────────────┐
│                        Chorus                               │
│                                                             │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│   │ Session 1   │  │ Session 2   │  │ Session 3   │        │
│   │ Claude Code │  │ Gemini CLI  │  │ Terminal    │        │
│   │ feature/auth│  │ fix/bug-123 │  │ main        │        │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│          │                │                │                │
│          └────────────────┼────────────────┘                │
│                           │                                 │
│              Git Worktrees (isolated)                       │
│        ~/.claude-chorus/worktrees/{repo}/{branch}           │
└─────────────────────────────────────────────────────────────┘
```

Each session gets:
- **Its own terminal** with full shell environment
- **Its own git worktree** for complete code isolation
- **Its own branch** for focused work
- **Real-time status** reporting via MCP

---

## Features

### Multi-Session Grid
Launch 1-6 AI sessions in a dynamic grid layout. Each session shows real-time status indicators (idle, working, waiting for input, done, error).

### Git Worktree Isolation
Assign a branch to each session. Chorus automatically creates isolated worktrees at `~/.claude-chorus/worktrees/`. No merge conflicts between sessions.

### Multiple AI Support
- **Claude Code** - Anthropic's AI coding assistant
- **Gemini CLI** - Google's Gemini
- **OpenAI Codex** - OpenAI's coding assistant
- **Plain Terminal** - Standard shell

### MCP Status Reporting
Built-in MCP server lets AI sessions report their state in real-time using the `chorus_status` tool.

### Visual Git Graph
See commits and branch relationships in a GitKraken-style visualization.

### Quick Actions
Configure custom action buttons per session: "Run App", "Commit & Push", or your own prompts.

### Plugin Marketplace
Extend Chorus with skills, commands, and MCP servers from the marketplace.

---

## Installation

### Requirements
- Node.js 18+
- Rust 1.70+ (for building)
- Git

### Build from Source

```bash
# Clone
git clone https://github.com/its-chorus-baby/chorus.git
cd chorus

# Install dependencies
npm install

# Build MCP server
cargo build --release -p chorus-mcp-server

# Run in development
npm run tauri dev

# Build for production
npm run tauri build
```

### Install AI CLIs (optional)

```bash
npm install -g @anthropic-ai/claude-code
npm install -g @google/gemini-cli
npm install -g @openai/codex
```

---

## Usage

1. **Launch Chorus**
2. **Open a project** (git repository)
3. **Configure sessions:**
   - Set number of terminals (1-6)
   - Choose AI mode for each
   - Assign branches
4. **Click Launch**

Each session opens in its own worktree. Work on multiple features simultaneously without conflicts.

### Session Controls
- `+` button: Add a session
- `×` on header: Close session
- Mode dropdown: Switch AI mode
- Branch dropdown: Assign worktree branch

---

## Project Structure

```
chorus/
├── src/                     # React frontend
│   ├── components/          # UI components
│   └── lib/                 # Utilities
├── src-tauri/               # Rust backend
│   └── src/
│       ├── commands/        # Tauri commands
│       └── core/            # Business logic
└── chorus-mcp-server/       # MCP server
```

### Tech Stack
| Component | Technology |
|-----------|------------|
| Desktop | Tauri 2.0, Rust |
| Frontend | React, TypeScript, Tailwind |
| Terminal | xterm.js |
| MCP | Rust |

---

## Troubleshooting

### Claude not found
```bash
npm install -g @anthropic-ai/claude-code
which claude
```

### Worktree issues
```bash
git worktree list
git worktree prune
```

### Build issues
```bash
rm -rf src-tauri/target node_modules
npm install
cargo build --release -p chorus-mcp-server
npm run tauri build
```

---

## License

MIT License - see [LICENSE](LICENSE)
