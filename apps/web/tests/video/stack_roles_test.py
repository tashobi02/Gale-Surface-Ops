import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location('stack_roles', ROOT / 'scripts/stack_roles.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StackRolesTest(unittest.TestCase):
    def run_main(self, argv):
        with mock.patch.object(sys, 'argv', argv):
            return module.main()

    def test_every_role_segment_is_an_input_to_the_stack(self):
        # The storm beat drives the HUD, the EVA tablet and the ops console at once, so the cut shows all three
        # side by side. The earlier assembler read only the first role's clip and dropped the rest (FD-517).
        segments = ['a.mp4', 'b.mp4', 'c.mp4']
        with mock.patch.object(subprocess, 'run') as run:
            self.run_main(['stack_roles.py', 'out.mp4', '3', *segments])
        command = run.call_args[0][0]
        self.assertEqual(command[0], 'ffmpeg')
        for segment in segments:
            self.assertIn(segment, command)
        graph = command[command.index('-filter_complex') + 1]
        self.assertIn('hstack=inputs=3[out]', graph)
        self.assertIn('[0:v]', graph)
        self.assertIn('[1:v]', graph)
        self.assertIn('[2:v]', graph)

    def test_a_single_role_is_copied_rather_than_stacked(self):
        with mock.patch.object(subprocess, 'run') as run:
            self.run_main(['stack_roles.py', 'out.mp4', '1', 'a.mp4'])
        self.assertEqual(run.call_args[0][0][:2], ['cp', 'a.mp4'])

    def test_the_count_must_match_the_segments(self):
        with self.assertRaises(SystemExit):
            self.run_main(['stack_roles.py', 'out.mp4', '3', 'a.mp4', 'b.mp4'])


if __name__ == '__main__':
    unittest.main()
