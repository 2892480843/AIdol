# Final Submission Delivery Implementation Plan

> **For agentic workers:** Execute in this session using the executing-plans workflow.

**Goal:** Deliver a reproducible source freeze, reviewer access instructions, honest baseline attribution, and a real product demonstration.

**Architecture:** Preserve the deployed product and database. Add submission documents and verification evidence, exclude private data and build caches, commit the current product source, then create an immutable submission tag and source archive.

**Tech Stack:** Git/GitHub, Python, SSH, Playwright, FFmpeg, existing Ubuntu systemd services.

- [ ] Verify reviewer credentials, authenticated pages, runtime identity, auto restart and resource boundary.
- [ ] Update README and add submission/access, reproducible startup, model/component and baseline/change documents; keep reviewer password in ignored private handoff only.
- [ ] Record actual public product interactions in a video under three minutes; inspect duration and key frames.
- [ ] Run source checks and appropriate tests; scan staged files for secrets, personal data and oversized build assets.
- [ ] Commit product/source and delivery evidence, push a version tag, produce SHA256-verified source archive and manifest, check remote visibility.

**Evidence boundary:** Without the pre-event organizer receipt, upstream provenance is not a verified pre-event archive. Server/API payment coverage requires account-owner confirmation. A submission package is not an organizer form receipt.
