#!/bin/bash

# Bedrock Forge CLI Installation Script
# This script installs the Bedrock Forge CLI globally on your system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/bedrock-forge/bedrock-forge.git"
INSTALL_DIR="$HOME/.bedrock-forge"
VENV_DIR="$INSTALL_DIR/venv"
BIN_DIR="$HOME/.local/bin"

# Helper functions
print_header() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                    Bedrock Forge CLI Installer               ║${NC}"
    echo -e "${BLUE}║                   🚀 WordPress Workflow Tool               ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

print_step() {
    echo -e "${PURPLE}🔧 $1${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command_exists apt-get; then
            echo "ubuntu"
        elif command_exists yum; then
            echo "centos"
        elif command_exists dnf; then
            echo "fedora"
        elif command_exists pacman; then
            echo "arch"
        else
            echo "linux"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        echo "windows"
    else
        echo "unknown"
    fi
}

# Install Python if not available
install_python() {
    local os=$(detect_os)
    print_step "Installing Python (OS: $os)"

    case $os in
        "ubuntu")
            if command_exists sudo; then
                sudo apt update
                sudo apt install -y python3 python3-pip python3-venv
            else
                print_error "sudo not found. Please install Python 3.9+ manually."
                exit 1
            fi
            ;;
        "macos")
            if command_exists brew; then
                brew install python3
            else
                print_error "Homebrew not found. Please install Python 3.9+ manually."
                exit 1
            fi
            ;;
        "centos"|"fedora")
            if command_exists sudo; then
                if [[ $os == "centos" ]]; then
                    sudo yum install -y python3 python3-pip
                else
                    sudo dnf install -y python3 python3-pip
                fi
            else
                print_error "sudo not found. Please install Python 3.9+ manually."
                exit 1
            fi
            ;;
        *)
            print_error "Unsupported OS for automatic Python installation. Please install Python 3.9+ manually."
            exit 1
            ;;
    esac
}

# Verify Python version
check_python() {
    if command_exists python3; then
        local python_version=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
        local required_version="3.9"

        if python3 -c "import sys; exit(0 if sys.version_info >= (3, 9) else 1)"; then
            print_success "Python $python_version found"
            return 0
        else
            print_error "Python $python_version found, but version 3.9+ is required"
            return 1
        fi
    else
        print_error "Python 3 not found"
        return 1
    fi
}

# Create installation directory
create_install_dir() {
    print_step "Creating installation directory"

    if [[ -d "$INSTALL_DIR" ]]; then
        print_warning "Installation directory already exists. Updating..."
        cd "$INSTALL_DIR"
        git pull origin main
    else
        mkdir -p "$INSTALL_DIR"
        cd "$INSTALL_DIR"
        git clone "$REPO_URL" .
    fi
}

# Create virtual environment
create_venv() {
    print_step "Creating Python virtual environment"

    if [[ -d "$VENV_DIR" ]]; then
        print_warning "Virtual environment already exists. Recreating..."
        rm -rf "$VENV_DIR"
    fi

    python3 -m venv "$VENV_DIR"
    source "$VENV_DIR/bin/activate"

    # Upgrade pip
    pip install --upgrade pip

    print_success "Virtual environment created"
}

# Install Bedrock Forge
install_forge() {
    print_step "Installing Bedrock Forge CLI"

    source "$VENV_DIR/bin/activate"
    pip install -e .

    print_success "Bedrock Forge CLI installed"
}

# Create global command
create_global_command() {
    print_step "Creating global command"

    # Create bin directory if it doesn't exist
    mkdir -p "$BIN_DIR"

    # Create forge script
    cat > "$BIN_DIR/forge" << EOF
#!/bin/bash
source "$VENV_DIR/bin/activate"
exec python -m forge "\$@"
EOF

    chmod +x "$BIN_DIR/forge"

    print_success "Global command created at $BIN_DIR/forge"
}

# Update PATH if needed
update_path() {
    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        print_step "Adding $BIN_DIR to PATH"

        # Detect shell and update appropriate config file
        if [[ -n "$BASH_VERSION" ]]; then
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
            SHELL_CONFIG="$HOME/.bashrc"
        elif [[ -n "$ZSH_VERSION" ]]; then
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
            SHELL_CONFIG="$HOME/.zshrc"
        else
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.profile"
            SHELL_CONFIG="$HOME/.profile"
        fi

        print_warning "Please run 'source $SHELL_CONFIG' or restart your terminal to use the forge command globally"
    else
        print_success "$BIN_DIR is already in PATH"
    fi
}

# Verify installation
verify_installation() {
    print_step "Verifying installation"

    # Test if forge command works
    if source "$VENV_DIR/bin/activate" && python -m forge --version >/dev/null 2>&1; then
        print_success "Bedrock Forge CLI is working correctly"

        # Show version
        local version=$(source "$VENV_DIR/bin/activate" && python -m forge --version 2>/dev/null || echo "unknown")
        print_info "Version: $version"

        # Show available commands
        echo
        print_info "Available commands:"
        echo "  forge --help              Show all available commands"
        echo "  forge local create-project mysite    Create a new project"
        echo "  forge config show         Show configuration"
        echo "  forge local list-projects List projects"

        return 0
    else
        print_error "Installation verification failed"
        return 1
    fi
}

# Show next steps
show_next_steps() {
    echo
    print_success "🎉 Installation completed successfully!"
    echo
    echo -e "${CYAN}Next steps:${NC}"
    echo "1. Run: forge --help"
    echo "2. Create your first project: forge local create-project mysite"
    echo "3. Read the documentation: https://github.com/bedrock-forge/bedrock-forge"
    echo
    echo -e "${CYAN}Useful commands:${NC}"
    echo "  forge update            Update to latest version"
    echo "  forge doctor            Check installation health"
    echo "  forge uninstall         Remove Bedrock Forge CLI"
    echo
}

# Main installation function
main() {
    print_header

    # Check if already installed
    if command_exists forge && forge --version >/dev/null 2>&1; then
        print_warning "Bedrock Forge CLI is already installed!"
        echo
        print_info "To update, run: forge update"
        echo "To reinstall, run: forge uninstall && curl -sSL https://raw.githubusercontent.com/bedrock-forge/bedrock-forge/main/install.sh | bash"
        exit 0
    fi

    # Check prerequisites
    print_step "Checking prerequisites"

    if ! check_python; then
        print_info "Attempting to install Python..."
        install_python

        if ! check_python; then
            print_error "Python installation failed. Please install Python 3.9+ manually and try again."
            exit 1
        fi
    fi

    # Check git
    if ! command_exists git; then
        print_error "Git is required but not installed. Please install Git and try again."
        exit 1
    fi

    print_success "Prerequisites check passed"

    # Installation steps
    create_install_dir
    create_venv
    install_forge
    create_global_command
    update_path
    verify_installation
    show_next_steps
}

# Handle script arguments
case "${1:-}" in
    "--help"|"-h")
        echo "Bedrock Forge CLI Installer"
        echo
        echo "Usage: $0 [options]"
        echo
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --uninstall    Uninstall Bedrock Forge CLI"
        echo "  --update       Update existing installation"
        echo "  --version      Show installer version"
        echo
        exit 0
        ;;
    "--uninstall")
        print_step "Uninstalling Bedrock Forge CLI"

        if [[ -d "$INSTALL_DIR" ]]; then
            rm -rf "$INSTALL_DIR"
            print_success "Installation directory removed"
        fi

        if [[ -f "$BIN_DIR/forge" ]]; then
            rm -f "$BIN_DIR/forge"
            print_success "Global command removed"
        fi

        print_success "Bedrock Forge CLI uninstalled successfully"
        exit 0
        ;;
    "--update")
        print_step "Updating Bedrock Forge CLI"

        if [[ -d "$INSTALL_DIR" ]]; then
            cd "$INSTALL_DIR"
            git pull origin main
            source "$VENV_DIR/bin/activate"
            pip install -e .
            print_success "Bedrock Forge CLI updated successfully"
        else
            print_error "Bedrock Forge CLI is not installed. Run installation script first."
            exit 1
        fi
        exit 0
        ;;
    "--version")
        echo "Bedrock Forge CLI Installer v1.0.0"
        exit 0
        ;;
    "")
        # Default behavior - install
        main
        ;;
    *)
        print_error "Unknown option: $1"
        echo "Run '$0 --help' for usage information."
        exit 1
        ;;
esac