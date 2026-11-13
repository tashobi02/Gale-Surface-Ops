#!/usr/bin/env python3
"""Lay the role segments of one beat side by side.

A beat that drove several roles (the storm beat drives the HUD, the EVA tablet and the ops console at once)
has one capture clip per role. The cut shows them side by side, so every role's screen is in the picture
rather than only the first role's (FD-517).

Usage: stack_roles.py <out.mp4> <count> <segment.mp4>...
"""
import subprocess
import sys

WIDTH = 1440
HEIGHT = 900


def main():
    if len(sys.argv) < 4:
        raise SystemExit("usage: stack_roles.py <out.mp4> <count> <segment.mp4>...")
    out = sys.argv[1]
    count = int(sys.argv[2])
    files = sys.argv[3:]
    if len(files) != count:
        raise SystemExit(f"error: expected {count} segments, got {len(files)}")
    if count == 1:
        subprocess.run(["cp", files[0], out], check=True)
        return

    # Every role gets an equal slice of the frame. The scale keeps the source's aspect ratio and pads the
    # remainder, so a 844x390 HUD frame is not stretched into its slice.
    tile_width = WIDTH // count
    scale = f"scale={tile_width}:{HEIGHT}:force_original_aspect_ratio=decrease,pad={tile_width}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black"
    chains = []
    labels = []
    for index in range(count):
        chains.append(f"[{index}:v]{scale}[s{index}]")
        labels.append(f"[s{index}]")
    graph = ";".join(chains) + ";" + "".join(labels) + f"hstack=inputs={count}[out]"

    command = ["ffmpeg", "-y", "-v", "error"]
    for path in files:
        command += ["-i", path]
    command += [
        "-filter_complex", graph,
        "-map", "[out]",
        "-an",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "20",
        out,
    ]
    subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
