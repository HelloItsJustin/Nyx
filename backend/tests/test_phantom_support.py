import importlib
import sys
import tempfile
import unittest
from pathlib import Path

from agents.phantom import _write_import_stubs


class PhantomSupportTests(unittest.TestCase):
    def test_disposable_stubs_resolve_finforge_import_dependencies(self):
        with tempfile.TemporaryDirectory() as directory:
            support = Path(directory)
            _write_import_stubs(support)
            sys.path.insert(0, str(support))
            try:
                for module in ["networkx", "pandas", "reportlab.lib.colors", "reportlab.lib.pagesizes", "reportlab.lib.styles", "reportlab.lib.units", "reportlab.platypus"]:
                    sys.modules.pop(module, None)
                importlib.import_module("networkx")
                importlib.import_module("pandas")
                importlib.import_module("reportlab.platypus")
            finally:
                sys.path.remove(str(support))
