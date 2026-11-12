# Replay recording

The web build copies `scenarios/storm-sol4190/recording.json` here in the build output when the backend recording exists. It is not duplicated in the repository. The static replay uses only this local file and verifies the hash when the recording contains the complete log.
