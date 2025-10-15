# Installation Guide

This guide will help you install and set up the Bedrock Forge CLI on your system.

## 🚀 Quick Installation

### 🎯 Method 1: One-Command Installation (Easiest)

```bash
# Install everything with one command
curl -sSL https://raw.githubusercontent.com/bedrock-forge/bedrock-forge/main/install.sh | bash

# Start using immediately
forge --help
```

**What this does:**
- ✅ Detects your OS and Python version
- ✅ Installs Python if needed (Ubuntu, macOS, CentOS)
- ✅ Creates virtual environment automatically
- ✅ Installs all dependencies
- ✅ Creates global `forge` command
- ✅ Adds to PATH if needed
- ✅ Verifies installation

### 📦 Method 2: Direct pip Installation

```bash
# Install directly from GitHub
pip install git+https://github.com/bedrock-forge/bedrock-forge.git

# Verify installation
forge --help
```

**Benefits:**
- ✅ Single command installation
- ✅ Uses pip package manager
- ✅ Automatic dependency management
- ✅ Easy to update with `pip install --upgrade`

### 🔧 Method 3: Clone and Install (Manual)

```bash
# Clone the repository
git clone https://github.com/bedrock-forge/bedrock-forge.git
cd bedrock-forge

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install in editable mode
pip install -e .

# Create global symlink (optional)
ln -sf $(pwd)/.venv/bin/forge ~/.local/bin/forge

# Verify installation
forge --help
```

**Benefits:**
- ✅ Full control over installation
- ✅ Easy for development and contributions
- ✅ Can modify source code
- ✅ Editable installation

## 📋 System Requirements

### Required
- **Python 3.9+** - Modern Python with type hints
- **pip** - Python package installer
- **Git** - For version control

### Optional Dependencies
- **DDEV** - For local WordPress development
- **Docker** - For containerized environments
- **Node.js** - For frontend build tools
- **Cloud Accounts** - Hetzner, Cloudflare, Google Drive

## 🔧 Detailed Installation Steps

### 1. Prerequisites

Ensure you have Python 3.9+ installed:

```bash
python3 --version  # Should be 3.9 or higher
pip3 --version     # Should show pip version
```

If you don't have Python installed, install it:

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install python3 python3-pip python3-venv

# macOS (using Homebrew)
brew install python3

# Windows (using Chocolatey)
choco install python
```

### 2. Clone the Repository

```bash
git clone https://github.com/bedrock-forge/bedrock-forge.git
cd bedrock-forge
```

### 3. Create Virtual Environment

```bash
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

### 4. Install Dependencies

```bash
pip install -r requirements.txt
```

### 5. Install Package

```bash
pip install -e .
```

### 6. Create Global Command (Optional)

For easy access without activating the virtual environment:

```bash
# Create symlink
ln -sf $(pwd)/.venv/bin/forge ~/.local/bin/forge

# Ensure ~/.local/bin is in your PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### 7. Verify Installation

```bash
forge --help
```

You should see the Bedrock Forge CLI help message with all available commands.

## 🐛 Troubleshooting

### Common Issues

#### 1. Command not found: forge
```bash
# Check if forge is in PATH
which forge

# If not found, add ~/.local/bin to PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

#### 2. Permission denied
```bash
# Make sure the symlink is executable
chmod +x ~/.local/bin/forge
```

#### 3. Python version compatibility
```bash
# Check Python version
python3 --version

# If using Python 2.x, use python3 explicitly
python3 -m forge --help
```

#### 4. Virtual environment issues
```bash
# Deactivate and reactivate virtual environment
deactivate
source .venv/bin/activate

# Recreate virtual environment if needed
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

#### 5. Module import errors
```bash
# Ensure all dependencies are installed
pip install -r requirements.txt

# Reinstall in editable mode
pip install -e .
```

### Getting Help

If you encounter any issues:

1. **Check the logs**: Use `--verbose` flag for detailed output
2. **Verify installation**: Run `forge --help` to confirm CLI is working
3. **Check dependencies**: Ensure all required packages are installed
4. **Create an issue**: [GitHub Issues](https://github.com/bedrock-forge/bedrock-forge/issues)

## 🔧 Installation Management

### Check Installation Health

```bash
# Run diagnostics
forge config doctor

# Check version
forge --version

# List all commands
forge --help
```

### Update to Latest Version

```bash
# Method 1: Using built-in update command
forge update

# Method 2: Using installation script
curl -sSL https://raw.githubusercontent.com/bedrock-forge/bedrock-forge/main/install.sh | bash

# Method 3: Manual update (if installed via git)
cd ~/.bedrock-forge
git pull origin main
source venv/bin/activate
pip install -e .

# Method 4: Using pip (if installed via pip)
pip install --upgrade git+https://github.com/bedrock-forge/bedrock-forge.git
```

### Uninstall Completely

```bash
# Method 1: Using built-in uninstall command
forge uninstall

# Method 2: Using installation script
curl -sSL https://raw.githubusercontent.com/bedrock-forge/bedrock-forge/main/install.sh | bash -s --uninstall

# Method 3: Manual removal
rm -rf ~/.bedrock-forge
rm -f ~/.local/bin/forge

# Remove from PATH if needed (edit ~/.bashrc or ~/.zshrc)
```

## 🔄 Updating the Installation

To update to the latest version:

```bash
cd bedrock-forge
git pull origin main
source .venv/bin/activate
pip install -e .
```

## 🗂️ File Structure After Installation

```
bedrock-forge/
├── forge/                    # Main CLI source code
│   ├── main.py              # CLI entrypoint
│   ├── commands/            # Subcommands
│   ├── utils/               # Shared utilities
│   └── ...
├── docs/                    # Documentation
├── requirements.txt         # Dependencies
├── pyproject.toml          # Package configuration
├── LICENSE                  # MIT License
└── README.md               # Main documentation
```

## 🎯 Next Steps

After successful installation:

1. **Configure your environment**: `forge config setup`
2. **Create your first project**: `forge local create-project mysite`
3. **Explore commands**: `forge --help`
4. **Read the documentation**: [Quick Start Guide](QUICK_START.md)

## 📚 Additional Resources

- [Quick Start Guide](QUICK_START.md) - Get started in 5 minutes
- [Command Reference](COMMANDS.md) - Complete command documentation
- [Configuration Guide](CONFIGURATION.md) - Setup and configuration
- [Development Guide](DEVELOPMENT.md) - Contributing guidelines