#!/bin/sh
set -eu

if [ "$(uname -s)" != "Linux" ]; then
    echo "This script supports Linux. On Windows, use install.ps1." >&2
    exit 1
fi

cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

if ! command -v make >/dev/null 2>&1 || ! command -v cc >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then
        SUDO=
    elif command -v sudo >/dev/null 2>&1; then
        SUDO=sudo
    else
        echo "Installing build tools requires root or sudo." >&2
        exit 1
    fi

    if command -v apt-get >/dev/null 2>&1; then
        $SUDO apt-get update
        $SUDO apt-get install -y build-essential
    elif command -v dnf >/dev/null 2>&1; then
        $SUDO dnf install -y gcc make
    elif command -v yum >/dev/null 2>&1; then
        $SUDO yum install -y gcc make
    elif command -v apk >/dev/null 2>&1; then
        $SUDO apk add build-base
    elif command -v pacman >/dev/null 2>&1; then
        $SUDO pacman -S --needed --noconfirm gcc make
    else
        echo "Unsupported package manager; install a C compiler and make manually." >&2
        exit 1
    fi
fi

if ! command -v make >/dev/null 2>&1 || ! command -v cc >/dev/null 2>&1; then
    echo "make or cc is still unavailable after installation." >&2
    exit 1
fi

exec make -B
