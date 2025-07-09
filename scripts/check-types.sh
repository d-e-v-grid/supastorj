#!/bin/bash

# Type checking script for when build tools aren't available
# This script performs basic checks on TypeScript files

echo "🔍 Checking TypeScript files for common issues..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check imports
check_imports() {
    local file=$1
    echo "Checking imports in $file..."
    
    # Check for missing .js extensions in relative imports
    if grep -E "from ['\"]\.\.?/" "$file" | grep -v "\.js['\"]" > /dev/null; then
        echo -e "${YELLOW}Warning: Missing .js extension in imports in $file${NC}"
    fi
}

# Function to check for common TypeScript issues
check_typescript_issues() {
    local file=$1
    
    # Check for 'any' type usage
    if grep -E ":\s*any\b" "$file" > /dev/null; then
        echo -e "${YELLOW}Warning: 'any' type used in $file${NC}"
    fi
    
    # Check for missing return types
    if grep -E "^\s*(export\s+)?(async\s+)?function\s+\w+\s*\([^)]*\)\s*{" "$file" > /dev/null; then
        echo -e "${YELLOW}Note: Check return types for functions in $file${NC}"
    fi
}

# Find all TypeScript files
find apps/cli/src -name "*.ts" -o -name "*.tsx" | while read -r file; do
    echo ""
    echo "Checking: $file"
    check_imports "$file"
    check_typescript_issues "$file"
done

echo ""
echo "✅ Basic checks completed!"
echo ""
echo "Note: This is a basic check. For full type checking, run:"
echo "  yarn workspace @supastorj/cli build"