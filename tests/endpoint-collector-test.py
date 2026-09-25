import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('collector', Path(__file__).resolve().parents[1] / 'scripts/endpoint_collect.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class CollectorTest(unittest.TestCase):
    def test_config_presence_never_reads_contents_and_rejects_traversal(self):
        with tempfile.TemporaryDirectory(prefix='byosync-collector-test-') as directory:
            root = Path(directory)
            (root / '.test-ai').write_text('NEVER-EXPORT-THIS-TEST-SECRET')
            registry = root / 'registry.yaml'
            registry.write_text('tools:\n  - id: test\n    name: Test tool\n    vendor: Test\n    category: coding\n    cli:\n      config_paths: [".test-ai", "../outside", "/etc/passwd"]\n')
            with patch.object(collector.subprocess, 'run', side_effect=OSError('test process inventory failure')):
                result = collector.collect(root, registry)
            self.assertEqual(len(result['tools']), 1)
            self.assertEqual(result['tools'][0]['evidence'], [{'kind': 'configuration_present', 'value': '~/.test-ai'}])
            self.assertNotIn('NEVER-EXPORT-THIS-TEST-SECRET', json.dumps(result))
            self.assertEqual(result['errors'][0]['code'], 'process_inventory_unavailable')


if __name__ == '__main__':
    unittest.main()
