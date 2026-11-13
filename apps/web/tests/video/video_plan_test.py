import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location('video_plan', ROOT / 'scripts/video_plan.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class VideoPlanTest(unittest.TestCase):
    def test_narration_comes_from_demo_script_with_the_adr_013_product_name(self):
        tracks = module.load_narration(ROOT / 'docs/ops/demo-script.md')
        self.assertEqual([len(tracks[t]) for t in ('240s', '30s')], [10, 4])
        self.assertEqual(tracks['240s'][2]['narration'], 'The planner adds a boxwork science stop and a resource stop at a hydrated-sulfate site. A suit-safe route computes, with an elevation profile and a time-to-haven band.')
        # ADR-013 named the product; the demo script and the on-screen app carry that name (FD-006).
        self.assertIn('Gale Surface Ops', tracks['30s'][0]['narration'])
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

    def test_a_multi_role_beat_keeps_every_role_clip(self):
        # The storm beat drives the HUD, the EVA tablet and the ops console at once, so the capture records one
        # clip per role; the 30-s cut assembles all three.
        raw = Path(tempfile.mkdtemp())
        (raw / 'hud.webm').write_bytes(b'x')
        (raw / 'eva.webm').write_bytes(b'x')
        (raw / 'ops.webm').write_bytes(b'x')
        beats = [{'id': '240-07', 'start_s': 0, 'end_s': 20, 'dur_s': 20, 'narration': 'text'}]
        records = [
            {'id': '240-07', 'clip': name, 'clipStartMs': 0, 'clipEndMs': 1500, 'reachedInMs': 500}
            for name in ('hud.webm', 'eva.webm', 'ops.webm')
        ]
        module.match_recordings(beats, records, raw)
        self.assertEqual([c['clip'] for c in beats[0]['clips']], ['hud.webm', 'eva.webm', 'ops.webm'])


if __name__ == '__main__':
    unittest.main()
