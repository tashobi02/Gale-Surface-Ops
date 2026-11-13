#!/usr/bin/env python3
"""Build a video assembly plan and subtitles from the demo script and capture manifest."""
import json
import re
import sys
from pathlib import Path

# The ADR-013 product name (FD-006). The demo script carries it verbatim; the constant names it once so the
# narration and the on-screen app cannot drift apart.
PRODUCT_NAME = 'Gale Surface Ops'


def validate_windows(beats, duration):
    cursor = 0
    for beat in beats:
        if beat['start_s'] != cursor or beat['end_s'] <= cursor:
            raise ValueError('Beat windows must be contiguous and positive')
        cursor = beat['end_s']
    if cursor != duration:
        raise ValueError(f'Beat windows must end at {duration}s')


def load_narration(path):
    tracks = {'240s': [], '30s': []}
    current = None
    text = path.read_text(encoding='utf8')
    # The spoken name must be the name on screen (ADR-013). A script that names another product is a stale script.
    if PRODUCT_NAME not in text:
        raise ValueError(f'The demo script does not name the product ({PRODUCT_NAME}); it is stale.')
    for line in text.splitlines():
        if re.match(r'^## 240-s\b', line):
            current = '240s'
        elif re.match(r'^## 30-s\b', line):
            current = '30s'
        elif current and line.startswith('|'):
            cells = [c.strip() for c in line.split('|')[1:-1]]
            match = re.fullmatch(r'(\d+):(\d{2})[–-](\d+):(\d{2})', cells[0]) if cells else None
            if not match:
                continue
            start = int(match[1]) * 60 + int(match[2])
            end = int(match[3]) * 60 + int(match[4])
            narration = re.sub(r'\*+', '', cells[-1])
            tracks[current].append({'id': f"{current[:-1]}-{len(tracks[current]) + 1:02d}", 'start_s': start,
                                    'end_s': end, 'dur_s': end - start, 'narration': narration})
    for name, duration in [('240s', 240), ('30s', 30)]:
        validate_windows(tracks[name], duration)
    return tracks


def match_recordings(beats, recordings, raw_dir):
    for beat in beats:
        # A beat that drove more than one role has one recording per role; the cut assembles all of them.
        matching = [record for record in recordings if record.get('id') == beat['id']]
        if not matching:
            raise ValueError(f"Expected at least one recording for {beat['id']}")
        names = [record.get('clip') for record in matching]
        if len(set(names)) != len(names):
            raise ValueError(f"Duplicate capture clip for {beat['id']}: {names}")
        clips = []
        for record in matching:
            path = raw_dir / record['clip']
            if not path.is_file():
                raise ValueError(f'Missing capture clip: {path}')
            start = record['clipStartMs'] / 1000
            end = record['clipEndMs'] / 1000
            if start < 0 or end <= start or record['reachedInMs'] > beat['dur_s'] * 1000:
                raise ValueError(f"Invalid capture timing for {beat['id']}")
            clips.append({'clip': record['clip'], 'path': str(path), 'start_s': start, 'end_s': end})
        beat['clips'] = clips
        beat.update(clip_path=clips[0]['path'], clip_start_s=clips[0]['start_s'], clip_end_s=clips[0]['end_s'])


def timestamp(seconds):
    ms = round(seconds * 1000)
    hours, rem = divmod(ms, 3600000)
    minutes, rem = divmod(rem, 60000)
    seconds, ms = divmod(rem, 1000)
    return f'{hours:02d}:{minutes:02d}:{seconds:02d},{ms:03d}'


def main():
    script, manifest_path, out_dir, plan_path = map(Path, sys.argv[1:])
    tracks = load_narration(script)
    manifest = json.loads(manifest_path.read_text(encoding='utf8'))
    for name, beats in tracks.items():
        match_recordings(beats, manifest['beats'], Path(manifest['raw_dir']))
        subtitles = []
        for i, beat in enumerate(beats, 1):
            subtitles.append(f"{i}\n{timestamp(beat['start_s'])} --> {timestamp(beat['end_s'])}\n{beat['narration']}\n")
        (out_dir / f'marswalk-{name}.srt').write_text('\n'.join(subtitles), encoding='utf8')
    plan_path.write_text(json.dumps(tracks, indent=2), encoding='utf8')


if __name__ == '__main__':
    main()
