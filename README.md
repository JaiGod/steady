# Steady (Time Management App, beta v2)

A new, separate app from the original [Time Management App](https://github.com/jaineil32624/time-management-app). Same idea, rebuilt around one new question: **what happens when every teacher assigns work on the same day?**

Steady is an offline-first app for students that plans your own work, forecasts crowded days, and lets a class see its combined workload with no accounts or servers. Built for the NJSBA STEAM Tank Challenge.

## What is new vs. the original app
| Original | Steady (new) |
|---|---|
| Plans one student's tasks | **Workload forecast**: load points per day, heat strip, collision detection (2+ major assessments on one day) |
| Priority score | Kept (importance × urgency × difficulty) |
| No scheduling help | **Load-aware study planner**: spreads prep in 15-minute chunks, lighter days first, 90 min/day cap |
| Single user | **School view**: anonymous share codes (`ST1.…`), combined class view, "best days to schedule a test" |
| n/a | Paper-free planning counter (sheets and trees) |

## Ideas borrowed from study and planner apps (reworked around workload)
- Dashboard greeting with count chips, quick-add bar, and a weekly date strip with a daily timeline
- Subject color-coding on every task
- A tree that grows during each focus session (finish it to plant it; ending early keeps minutes but no tree)
- Flash cards with a quick review round
- Stress check-in and a "one win today" line, kept on the device (a self check-in, not medical advice)

## Tabs
Today · Plan · Load · Focus · School · Method

## Evidence
Our own survey of 92 students: 86% struggled with time management; reasons were schoolwork 82%, too much homework 66%, after-school activities 58%, college applications 38%.

## Model and assumptions
Item load: Homework 1, Quiz 2, Essay 3, Project 3, Test 4, +1 if hard. Day level: light 1–3, moderate 4–6, heavy 7+. **These weights are assumptions to validate with teachers and counselors.** Share codes hold only due date, type, hard flag and a random token (no titles or names). Paper conversion uses ~8,333 sheets per tree.

## Run, test, build
- Open `docs/index.html` (or serve `docs/`; it is a PWA, so it installs and works offline).
- `npm test` runs 23 engine tests.
- Android wrapper (WebView): `./gradlew assembleDebug`. **Not built or tested yet** (needs the Android SDK).

Screenshots in `docs/screenshots/` use sample data, not real students.

## Get the APK
Every push runs the **Build APK** workflow (Actions tab). Open the latest run and download the `steady-debug-apk` artifact, then install it on an Android phone. This is a debug build for testing; a signed release build is needed for Google Play.
