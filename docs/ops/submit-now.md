# Final Submission Guide — Submit Now (T16.06 / T30.01 / FD-192)

| | |
| --- | --- |
| **Owner** | Story lead / Team lead · Obidit Islam ([docs/ops/team.md](team.md)) |
| **Date** | 2026-11-13 |
| **Status** | Actionable submission procedure for human team leads ([docs/plan/frontend/decisions.md](../plan/frontend/decisions.md) FD-160, FD-192) |
| **Deadline** | **13 Nov 2026, 18:00 Asia/Dhaka** ([docs/ops/submission-checklist.md](submission-checklist.md), [docs/specs/06_High_Level_Implementation_Plan.md](../specs/06_High_Level_Implementation_Plan.md) §A) |
| **Responsible** | **Obidit Islam** (`@tashobi02`) or **Sadman Shaharier Mahim** (`@deatrax`) ([docs/ops/team.md](team.md)) |
| **Related** | [Project Page Text](project-page.md) · [Submission Checklist](submission-checklist.md) · [Hosting](hosting.md) · [Rules](rules.md) · [Team Roster](team.md) |

---

## 1. Context and Ownership (FD-192)

Per decision **FD-192** ([docs/plan/frontend/decisions.md](../plan/frontend/decisions.md)), external portal submission is the single phase that cannot be performed by automated agents due to credential requirements. The team owner and systems lead are the authorized human actors with portal access ([docs/ops/team.md](team.md)):

- **Primary Actor:** Obidit Islam (`@tashobi02`, Team Owner / Lead)
- **Secondary Actor:** Sadman Shaharier Mahim (`@deatrax`, Product & Systems Lead)
- **Team Name on Portal:** CheesySpace ([docs/ops/team.md](team.md))
- **Registered Challenge:** *Interplanetary Survival Guide: Martian Map* ([docs/ops/team.md](team.md))
- **Hard Cutoff:** 13 Nov 2026, 18:00 Asia/Dhaka ([docs/ops/submission-checklist.md](submission-checklist.md))
- **Publication Status:** Nothing has been uploaded, made public, or submitted on external portals yet; every remaining step below requires a human team member.

### Remaining Human Actions (Cannot Be Automated)

| Remaining human action | Owner | Why it cannot be automated |
| --- | --- | --- |
| Make repository public (or package private archive) and upload `gale_boxwork` bundle release asset ([hosting.md](hosting.md)) | Team owner / Data lead | Requires GitHub repository admin credentials, external network upload of large binary archives outside Git, and team consent for public visibility (FD-160). |
| Enable GitHub Pages (`#/replay`) and verify public repo + Pages URLs in a private browser window | Team lead / Systems lead | Requires GitHub repository settings access and unauthenticated external browser verification against live GitHub hosting. |
| Assemble/voice-check 240-s & 30-s videos in `var/videos/`, upload to video host, and record URLs | Story lead / Team lead | Local macOS `say` / human voiceover recording, audio/caption spot-check, and uploading to YouTube/Vimeo require local workstation audio hardware and personal/team account credentials (FD-492). |
| Confirm each team member's consent for public listing and optional profile links | All 6 team members | Publishing personal profile links requires explicit individual human consent ([team.md](team.md)). |
| Check live 2026 Project Submission & Judging guides and complete any custom portal questionnaire fields | Team owner / Systems lead | Official 2026 portal forms and participant guides sit behind authenticated event login outside this repository. |
| Enter fields, attach links, click **Submit Project** before 18:00 Asia/Dhaka, and record confirmation timestamp/ID | Obidit Islam / Sadman Shaharier Mahim | Requires authenticated NASA Space Apps team-lead portal credentials and binding team sign-off (FD-192). |

---

## 2. 15-Minute Pre-Submission Dry Run (Perform at 17:15–17:30 Asia/Dhaka)

Complete these checks 45 to 30 minutes before the 18:00 Asia/Dhaka deadline:

1. **Verify Video Assets (T - 45 min):**
   - Confirm the 240-second local judging video exists in `var/videos/` (TO BE FILLED BY THE TEAM: file name, once package 32 has produced it) ([docs/plan/frontend/32-videos.md](../plan/frontend/32-videos.md), [docs/ops/submission-checklist.md](submission-checklist.md)).
   - Confirm the 30-second global summary video exists in `var/videos/` (TO BE FILLED BY THE TEAM: file name, once package 32 has produced it) ([docs/plan/frontend/32-videos.md](../plan/frontend/32-videos.md), [docs/ops/submission-checklist.md](submission-checklist.md)).
   - Spot-check video playback: audio is audible, English subtitles are visible, datasets and POIs are credited on camera, no under-18 likeness appears, and the prototype boundary statement (01 §F.1) is stated clearly ([docs/ops/submission-checklist.md](submission-checklist.md)).

2. **Verify Repository Cleanliness & Secret Scan (T - 40 min):**
   - Run the local gate check:

     ```sh
     make lint docs-check
     ```

   - Ensure the working tree has no uncommitted edits or extraneous untracked files.
   - If making the repository public per FD-160, run a secret check (`gitleaks` or regex search) to ensure no tokens or keys are present ([docs/plan/frontend/decisions.md](../plan/frontend/decisions.md) FD-160).
   - If submitting as a private archive, build the clean submission zip per the data lead's decision ([docs/ops/hosting.md](hosting.md)).

3. **Verify Public Replay Demo Link (T - 35 min):**
   - Open the GitHub Pages public replay link (`#/replay`, package 27; [docs/ops/hosting.md](hosting.md) FD-160) in an incognito / private browser window.
   - Verify the static recording loads and displays the simulated traverse, telemetry strip, and event timeline without requiring login or a local Hab Core server ([docs/plan/frontend/27-replay.md](../plan/frontend/27-replay.md)).

4. **Verify Project Page Text (T - 30 min):**
   - Review [docs/ops/project-page.md](project-page.md) to ensure all team roster details and source credits match the submission package.

---

## 3. Step-by-Step Portal Submission Procedure (Checklist Order)

Follow these exact steps in order on the official NASA Space Apps Challenge portal:

### Step 3.1: Log In to the Space Apps Portal

1. Open a browser and navigate to: `https://www.spaceappschallenge.org/`
2. Sign in with the registered team lead account (Obidit Islam or Sadman Shaharier Mahim).
3. Confirm team registration under the Dhaka, Bangladesh local event ([docs/ops/team.md](team.md), [docs/ops/rules.md](rules.md)).

### Step 3.2: Open the Team Project Page Editor

1. Navigate to the CheesySpace project edit page.
2. Verify the selected challenge is:
   `Interplanetary Survival Guide: Martian Map`

### Step 3.3: Fill Project Metadata and Descriptions

Copy and paste the exact text prepared in [docs/ops/project-page.md](project-page.md):

1. **Project Title:**
   - Enter: `Gale Surface Ops`
2. **Short Description / Summary (≤ 200 words):**
   - Copy the summary block from [docs/ops/project-page.md](project-page.md) §Project Summary.
   - Verify word count on portal does not exceed limits.
3. **Detailed Project Description:**
   - Paste the structured sections from [docs/ops/project-page.md](project-page.md):
     - **What It Does**
     - **How It Works Offline on the Habitat LAN**
     - **Data and Credits** (including USGS, PDS, CCMC DONKI, MSL RAD, and ESA partner credits)
     - **AI-Use Statement** (emphasizing deterministic science, no AI in the app, and audit logging)
     - **Team Roster** (all 6 registered members with their roles; add profile links only for members who agreed)
4. **Custom Portal Fields:**
   - If the 2026 submission form contains additional questionnaire prompts not in the repo:
     TO BE FILLED BY THE TEAM: portal custom questionnaire or field values

### Step 3.4: Provide Video Links

1. **240-Second Local Judging Video:**
   - Upload the 240-second video from `var/videos/` to YouTube, Vimeo, or the portal's video host.
   - Enter the video URL into the primary project video field.
   - URL: TO BE FILLED BY THE TEAM: 240-second video URL
2. **30-Second Global Summary Video:**
   - Upload the 30-second video from `var/videos/` to the designated 30-second video host.
   - Enter the 30-second video URL into the designated field.
   - URL: TO BE FILLED BY THE TEAM: 30-second video URL

### Step 3.5: Provide Repository and Demonstration Links

1. **Code Repository Link:**
   - Enter the project GitHub repository URL (or link to the downloadable submission archive per FD-160):
     URL: TO BE FILLED BY THE TEAM: repository URL
2. **Public Interactive Replay Demo Link:**
   - Enter the GitHub Pages static replay URL (`#/replay`):
     URL: TO BE FILLED BY THE TEAM: public replay demo URL
3. **Additional Links / Release Assets:**
   - Enter any secondary asset links requested:
     TO BE FILLED BY THE TEAM: any additional link fields requested by portal

### Step 3.6: Final Review and Submission

1. Review all entered fields in the portal preview screen.
2. Open each provided video and project link in a private/incognito browser window to verify public accessibility without login barriers.
3. Click the final **Submit Project** button before 18:00 Asia/Dhaka.
4. Capture a full screenshot of the submission confirmation screen with the system clock visible.
5. Record the exact submission timestamp and update the team status:
   `TO BE FILLED BY THE TEAM: exact submission timestamp and confirmation ID`
