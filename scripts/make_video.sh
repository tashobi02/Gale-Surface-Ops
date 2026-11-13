#!/usr/bin/env bash
# Assemble 240-s and 30-s demo videos + English SRT subtitles from Playwright capture output.
# Usage: bash scripts/make_video.sh [capture-manifest.json]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_SCRIPT="${ROOT_DIR}/docs/ops/demo-script.md"
MANIFEST_JSON="${1:-${ROOT_DIR}/var/videos/capture-manifest.json}"
OUT_DIR="${ROOT_DIR}/var/videos"
SEG_DIR="${OUT_DIR}/_segments"

command -v ffmpeg >/dev/null 2>&1 || { echo "error: ffmpeg not found" >&2; exit 1; }
command -v ffprobe >/dev/null 2>&1 || { echo "error: ffprobe not found" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "error: python3 not found" >&2; exit 1; }

if [[ ! -f "${MANIFEST_JSON}" ]]; then
  echo "error: capture manifest missing: ${MANIFEST_JSON}" >&2
  echo "run: E2E_PORT=8132 make e2e-one CHECK=capture" >&2
  exit 1
fi

mkdir -p "${OUT_DIR}" "${SEG_DIR}"
trap 'rm -rf "${SEG_DIR}"' EXIT

detect_tts() {
  for bin in say espeak-ng espeak pico2wave flite; do
    if command -v "${bin}" >/dev/null 2>&1; then
      echo "${bin}"
      return 0
    fi
  done
  return 1
}

TTS_BIN="$(detect_tts || true)"
if [[ -z "${TTS_BIN}" ]]; then
  echo "notice: no TTS binary found (checked: say, espeak-ng, espeak, pico2wave, flite); assembling video with burned-in English subtitles and .srt only (audio track pending macOS say or human voice)."
else
  echo "notice: detected TTS binary: ${TTS_BIN}"
fi

# The script's narration table is the source of truth; the plan refuses missing or invalid recordings.
PLAN_JSON="${SEG_DIR}/plan.json"
python3 "${ROOT_DIR}/scripts/video_plan.py" "${DEMO_SCRIPT}" "${MANIFEST_JSON}" "${OUT_DIR}" "${PLAN_JSON}"

synthesize_tts() {
  local text="$1"
  local out_wav="$2"
  case "${TTS_BIN}" in
    say)
      local tmp_aiff="${out_wav%.wav}.aiff"
      say -o "${tmp_aiff}" "${text}"
      ffmpeg -y -v error -i "${tmp_aiff}" -ar 44100 -ac 1 "${out_wav}"
      rm -f "${tmp_aiff}"
      ;;
    espeak-ng|espeak)
      "${TTS_BIN}" -w "${out_wav}" "${text}"
      ;;
    pico2wave)
      pico2wave -w "${out_wav}" "${text}"
      ;;
    flite)
      flite -t "${text}" -o "${out_wav}"
      ;;
    *)
      return 1
      ;;
  esac
}

build_track() {
  local track_key="$1"
  local label="$2"
  local min_s="$3"
  local max_s="$4"
  local out_mp4="${OUT_DIR}/marswalk-${label}.mp4"
  local srt_file="${OUT_DIR}/marswalk-${label}.srt"
  local concat_list="${SEG_DIR}/concat-${label}.txt"
  local raw_concat="${SEG_DIR}/raw-${label}.mp4"
  : > "${concat_list}"

  local count
  count="$(python3 -c "import json; d=json.load(open('${PLAN_JSON}')); print(len(d['${track_key}']))")"
  for ((i=0; i<count; i++)); do
    # A beat that drove several roles has one recording per role; the cut lays them side by side, so every role's
    # footage is in the picture rather than only the first role's (FD-517).
    local role_rows
    role_rows="$(python3 - "${PLAN_JSON}" "${track_key}" "${i}" <<'PYEOF'
import json, sys
d = json.load(open(sys.argv[1]))[sys.argv[2]][int(sys.argv[3])]
for clip in d["clips"]:
    print("\t".join([d["id"], clip["path"], f"{clip['start_s']:.3f}", f"{clip['end_s']:.3f}", f"{d['dur_s']:.3f}"]))
PYEOF
)"
    local bid
    bid="$(head -n 1 <<< "${role_rows}" | cut -f1)"
    local dur
    dur="$(head -n 1 <<< "${role_rows}" | cut -f5)"
    local seg_mp4="${SEG_DIR}/${label}-${bid}.mp4"

    # Cut each role's own segment first.
    local role_files=()
    local clip_index=0
    local IFS_TAB=$'\t'
    while read -r _bid clip_path cstart cend _dur; do
      [[ -z "${clip_path}" ]] && continue
      local span
      span="$(python3 -c "print(max(0.5, float('${cend}') - float('${cstart}')))")"
      local role_mp4="${SEG_DIR}/${label}-${bid}-${clip_index}.mp4"
      # Scale cleanly to 1440x900 (keeps EVA/HUD 844x390 crisp without stretching), clone last frame to match exact slot duration.
      ffmpeg -y -v error \
        -ss "${cstart}" -t "${span}" -i "${clip_path}" \
        -vf "scale=1440:900:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=${dur},trim=duration=${dur},format=yuv420p" \
        -an -c:v libx264 -preset fast -crf 20 "${role_mp4}"
      role_files+=("${role_mp4}")
      clip_index=$((clip_index + 1))
    done <<< "${role_rows}"

    if [[ "${#role_files[@]}" -eq 1 ]]; then
      cp "${role_files[0]}" "${seg_mp4}"
    else
      # Several roles in one beat: lay them side by side so every role's screen is visible at once.
      python3 "${ROOT_DIR}/scripts/stack_roles.py" "${seg_mp4}" "${#role_files[@]}" "${role_files[@]}"
    fi
    printf "file '%s'\n" "${seg_mp4}" >> "${concat_list}"
  done

  ffmpeg -y -v error -f concat -safe 0 -i "${concat_list}" -c copy "${raw_concat}"

  local audio_concat="${SEG_DIR}/audio-${label}.txt"
  local full_audio="${SEG_DIR}/audio-${label}.wav"
  local has_audio="0"
  if [[ -n "${TTS_BIN}" ]]; then
    : > "${audio_concat}"
    has_audio="1"
    for ((i=0; i<count; i++)); do
      local text_dur
      text_dur="$(python3 - "${PLAN_JSON}" "${track_key}" "${i}" <<'PYEOF'
import json, sys
d = json.load(open(sys.argv[1]))[sys.argv[2]][int(sys.argv[3])]
print(d["id"])
print(d["dur_s"])
print(d["narration"])
PYEOF
)"
      local bid dur narration
      bid="$(echo "${text_dur}" | sed -n '1p')"
      dur="$(echo "${text_dur}" | sed -n '2p')"
      narration="$(echo "${text_dur}" | sed -n '3p')"
      local raw_wav="${SEG_DIR}/${label}-${bid}.raw.wav"
      local pad_wav="${SEG_DIR}/${label}-${bid}.wav"
      if synthesize_tts "${narration}" "${raw_wav}"; then
        local audio_duration
        audio_duration="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${raw_wav}")"
        python3 - "${audio_duration}" "${dur}" "${bid}" <<'PYEOF'
import sys
if float(sys.argv[1]) > float(sys.argv[2]):
    raise SystemExit(f"error: narration for {sys.argv[3]} exceeds its slot; use a shorter recording or adjust the approved script")
PYEOF
        ffmpeg -y -v error -i "${raw_wav}" -af "apad=whole_dur=${dur},atrim=0:${dur}" -ar 44100 -ac 1 "${pad_wav}"
        printf "file '%s'\n" "${pad_wav}" >> "${audio_concat}"
      else
        has_audio="0"
        break
      fi
    done
    if [[ "${has_audio}" == "1" ]]; then
      ffmpeg -y -v error -f concat -safe 0 -i "${audio_concat}" -c:a pcm_s16le "${full_audio}"
    fi
  fi

  local srt_escaped="${srt_file//\\/\\\\}"
  srt_escaped="${srt_escaped//:/\\:}"
  if [[ "${has_audio}" == "1" ]]; then
    ffmpeg -y -v error -i "${raw_concat}" -i "${full_audio}" \
      -vf "subtitles='${srt_escaped}':force_style='FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=3,Outline=1,MarginV=24'" \
      -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "${out_mp4}"
  else
    ffmpeg -y -v error -i "${raw_concat}" \
      -vf "subtitles='${srt_escaped}':force_style='FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=3,Outline=1,MarginV=24'" \
      -an -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "${out_mp4}"
  fi

  local actual_dur vinfo
  vinfo="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height -show_entries format=duration -of default=noprint_wrappers=1 "${out_mp4}")"
  actual_dur="$(echo "${vinfo}" | awk -F= '/^duration=/{print $2}')"
  python3 - "${actual_dur}" "${min_s}" "${max_s}" "${out_mp4}" <<'PYEOF'
import sys
dur, lo, hi, path = float(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
if not (lo <= dur <= hi):
    raise SystemExit(f"error: {path} duration {dur:.2f}s outside expected [{lo}, {hi}]s")
print(f"verified: {path} duration={dur:.2f}s (within [{lo}, {hi}]s)")
PYEOF
}

build_track "240s" "240s" "235" "245"
build_track "30s" "30s" "28" "32"
