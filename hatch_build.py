"""Custom Hatch build hook that builds the React UI before packaging."""

import subprocess
import shutil
from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class UIBuildHook(BuildHookInterface):
    PLUGIN_NAME = "ui-build"

    def initialize(self, version, build_data):
        root = Path(self.root)
        ui_src = root / "ui"
        dist_dir = root / "src" / "riverflow" / "server" / "ui" / "dist"

        if not ui_src.exists():
            return

        npm = shutil.which("npm")
        if npm is None:
            if dist_dir.exists() and any(dist_dir.iterdir()):
                # Pre-built assets exist, skip
                return
            raise RuntimeError(
                "npm is not installed. Install Node.js to build the UI, "
                "or provide pre-built assets in src/riverflow/server/ui/dist/"
            )

        subprocess.run([npm, "ci"], cwd=str(ui_src), check=True)
        subprocess.run([npm, "run", "build"], cwd=str(ui_src), check=True)
