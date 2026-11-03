---
name: verify
description: Run project checks before a commit or after changing compute, pipeline or UI code.
---
Run each as a separate command:
1. make lint
2. make typecheck
3. make test
4. If docs changed: make docs-check
5. If pipeline code or site assets changed: run the manifest validator named in
   the Makefile or pipeline docs. If you can't find it, say so.

Report failures with file and test name. Never weaken a test to make it pass.
