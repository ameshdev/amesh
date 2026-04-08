#!/usr/bin/env bash
# install.sh — standalone installer for amesh (no Node/npm/Bun required)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ameshdev/amesh/main/packaging/install.sh | bash
#
# Options (via env vars):
#   VERSION=0.5.1        Install a specific version (default: latest)
#   INSTALL_DIR=/path    Install to a custom directory (default: /usr/local/bin)
#
# Supported platforms: linux-x64, linux-arm64, darwin-x64, darwin-arm64

set -euo pipefail

REPO="ameshdev/amesh"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

# --- Helpers ----------------------------------------------------------------

info()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
error() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" > /dev/null 2>&1 || error "Required command not found: $1"
}

# --- Detect platform --------------------------------------------------------

detect_platform() {
  local os arch

  os="$(uname -s)"
  case "$os" in
    Linux)  os="linux" ;;
    Darwin) os="darwin" ;;
    *)      error "Unsupported OS: $os" ;;
  esac

  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64)  arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)             error "Unsupported architecture: $arch" ;;
  esac

  echo "${os}-${arch}"
}

# --- Resolve version --------------------------------------------------------

resolve_version() {
  if [ -n "${VERSION:-}" ]; then
    echo "$VERSION"
    return
  fi

  info "Fetching latest release version..."

  local tag
  # Try GitHub API first, fall back to redirect-based detection.
  if command -v curl > /dev/null 2>&1; then
    tag="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
      | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//')"
  elif command -v wget > /dev/null 2>&1; then
    tag="$(wget -qO- "https://api.github.com/repos/${REPO}/releases/latest" \
      | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//')"
  else
    error "Either curl or wget is required"
  fi

  [ -n "$tag" ] || error "Could not determine latest release version"

  # Strip leading 'v' if present
  echo "${tag#v}"
}

# --- Download ---------------------------------------------------------------

download() {
  local url="$1" dest="$2"

  if command -v curl > /dev/null 2>&1; then
    curl -fSL --progress-bar -o "$dest" "$url"
  elif command -v wget > /dev/null 2>&1; then
    wget -q --show-progress -O "$dest" "$url"
  else
    error "Either curl or wget is required"
  fi
}

# --- Main -------------------------------------------------------------------

main() {
  local platform version tarball url tmpdir

  platform="$(detect_platform)"
  version="$(resolve_version)"
  tarball="amesh-${version}-${platform}.tar.gz"
  url="https://github.com/${REPO}/releases/download/v${version}/${tarball}"

  info "Installing amesh v${version} for ${platform}"
  info "Download: ${url}"

  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  download "$url" "${tmpdir}/${tarball}"

  info "Extracting..."
  tar -xzf "${tmpdir}/${tarball}" -C "$tmpdir"

  # Install all binaries found in the tarball.
  local installed=0
  for bin in amesh amesh-agent amesh-se-helper; do
    if [ -f "${tmpdir}/${bin}" ]; then
      # Use sudo if we can't write to INSTALL_DIR directly.
      if [ -w "$INSTALL_DIR" ]; then
        install -m 755 "${tmpdir}/${bin}" "${INSTALL_DIR}/${bin}"
      else
        info "Elevated permissions required to install to ${INSTALL_DIR}"
        sudo install -m 755 "${tmpdir}/${bin}" "${INSTALL_DIR}/${bin}"
      fi
      installed=$((installed + 1))
    fi
  done

  [ "$installed" -gt 0 ] || error "No binaries found in tarball"

  info "Installed to ${INSTALL_DIR}"

  # Verify
  if command -v amesh-agent > /dev/null 2>&1; then
    info "amesh-agent is ready! Run 'amesh-agent --help' to get started."
  elif [ -x "${INSTALL_DIR}/amesh-agent" ]; then
    warn "${INSTALL_DIR} is not in your PATH. Add it with:"
    warn "  export PATH=\"${INSTALL_DIR}:\$PATH\""
  fi
}

main "$@"
