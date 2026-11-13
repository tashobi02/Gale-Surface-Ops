import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location('video_plan', ROOT / 'scripts/video_plan.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class VideoPlanTest(unittest.TestCase):
    def test_narration_comes_from_demo_script_with_explicit_name_placeholder(self):
        tracks = module.load_narration(ROOT / 'docs/ops/demo-script.md')
        self.assertEqual([len(tracks[t]) for t in ('240s', '30s')], [10, 4])
        self.assertEqual(tracks['240s'][2]['narration'], 'The planner adds a boxwork science stop and a resource stop at a hydrated-sulfate site. A suit-safe route computes, with an elevation profile and a time-to-haven band.')
        self.assertIn('[PRODUCT NAME PENDING ADR-013]', tracks['30s'][0]['narration'])
        self.assertNotIn('Marswalk Surface Ops', tracks['30s'][0]['narration'])

    def test_rejects_gaps_and_overlaps(self):
        for start in (19, 21):
            with self.subTest(start=start), self.assertRaisesRegex(ValueError, 'contiguous'):
                module.validate_windows([{'start_s': 0, 'end_s': 20}, {'start_s': start, 'end_s': 30}], 30)

    def test_rejects_incomplete_or_duplicate_capture(self):
        beats = [{'id': '240-01', 'start_s': 0, 'end_s': 20, 'dur_s': 20, 'narration': 'text'}]
        for records in ([], [{'id': '240-01'}, {'id': '240-01'}]):
            with self.subTest(records=records), self.assertRaises(ValueError):
                module.match_recordings(beats, records, Path('/tmp'))


if __name__ == '__main__':
    unittest.main()
