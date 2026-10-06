#!/usr/bin/env bash
# ============================================
# Rally 3D - Veltron Edition - Launcher
# Starts local server and opens the game
# ============================================

cd "$(dirname "$0")"

echo ""
echo "============================================"
echo "  Rally 3D - Veltron Edition"
echo "  Starting local server..."
echo "============================================"
echo ""

# Check for Python 3
if command -v python3 &> /dev/null; then
    echo "[OK] Python 3 found"
    echo "[OK] Server starting at http://localhost:8123"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    open "http://localhost:8123" 2>/dev/null || xdg-open "http://localhost:8123" 2>/dev/null || true
    python3 -m http.server 8123
    exit 0
fi

# Check for Python
if command -v python &> /dev/null; then
    echo "[OK] Python found"
    echo "[OK] Server starting at http://localhost:8123"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    open "http://localhost:8123" 2>/dev/null || xdg-open "http://localhost:8123" 2>/dev/null || true
    python -m http.server 8123
    exit 0
fi

# Check for Node.js (use bundled server.js - no npm install needed)
if command -v node &> /dev/null; then
    echo "[OK] Node.js found"
    echo "[OK] Server starting at http://localhost:8123"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    open "http://localhost:8123" 2>/dev/null || xdg-open "http://localhost:8123" 2>/dev/null || true
    node server.js 8123
    exit 0
fi

# No server found
echo "[ERROR] No suitable server found."
echo ""
echo "Please install one of the following:"
echo "  - Python 3 (https://www.python.org/downloads/)"
echo "  - Node.js (https://nodejs.org/)"
echo ""
echo "Or run manually:"
echo "  python -m http.server 8123"
echo "  node server.js 8123"
echo ""
read -p "Press Enter to continue..."
exit 1
