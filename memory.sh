#!/bin/bash
#
# memory.sh
#
# Lists all source files (recursively) except those in node_modules / cache
# and package-lock.json, concatenates each file preceded by a heading
# "### <relative/path>", and copies the result to the macOS clipboard.

set -euo pipefail

# Create a temporary file for concatenated content
temp_file=$(mktemp)

echo "Listing and concatenating files (excluding node_modules, cache, and package-lock.json)…"

find . \
  -type f \
  ! -path "*/node_modules/*" \
  ! -path "*/cache/*" \
  ! -name "package-lock.json" \
  ! -name "*/tests/*" \
  \( -name "*.ts" -o -name "*.js" -o -name "*.json" -o -name "*.md" -o -name "*.sol" -o -name "*.css" \) \
| while IFS= read -r file; do
    echo "### $file"                  # progress log to terminal
    {
      echo -e "\n### $file\n"          # heading into temp file
      cat "$file"
      echo                              # trailing newline for separation
    } >> "$temp_file"
done

echo "Copying concatenated content to clipboard…"
pbcopy < "$temp_file"

# Clean up
rm "$temp_file"
echo "All file contents (with labels) have been copied to the clipboard!"
