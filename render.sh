#!/bin/sh
# Render the site from any working directory.
#
#   ./render.sh            render and write docs/
#   ./render.sh preview    live preview at http://localhost:8002
#
# Quarto is taken from PATH when available, otherwise from a conda environment
# named "quarto".
set -e
cd "$(dirname "$0")"

if [ "$1" = "preview" ]; then
  set -- preview --port 8002
else
  set -- render
fi

if command -v quarto >/dev/null 2>&1; then
  exec quarto "$@"
fi
for CONDA in "$(command -v conda 2>/dev/null)" "$HOME/miniforge3/bin/conda" "$HOME/anaconda3/bin/conda" "$HOME/miniconda3/bin/conda"; do
  if [ -n "$CONDA" ] && [ -x "$CONDA" ]; then
    exec "$CONDA" run --no-capture-output -n quarto quarto "$@"
  fi
done
echo "Quarto was not found. Install it from https://quarto.org or with: conda create -n quarto -c conda-forge quarto" >&2
exit 1
