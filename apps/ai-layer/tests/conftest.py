"""Make `import ai_layer` resolve even without an editable install (adds the app
dir to sys.path). With `pip install -e apps/ai-layer` this is redundant but harmless."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
