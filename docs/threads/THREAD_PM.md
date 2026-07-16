# Thread Guide: PM / Overall Coordination

## Purpose

This thread coordinates the whole Solar Site Precheck / Solar実務Portal project.

It does not need to implement every detail directly. Its main job is to keep the project coherent.

## Read first

1. `docs/project/PROJECT_CONTEXT.md`
2. `docs/project/PROJECT_WORKFLOW.md`
3. `README.md`
4. `CHANGELOG.md`

## Responsibilities

- Decide what should be done next.
- Separate app work from portal work.
- Keep the project philosophy stable.
- Decide release boundaries.
- Summarize results from other threads.
- Keep track of risks, pending issues, and user-facing value.

## Core decision rule

Use this rule for every decision:

> Does this reduce Solar Pro pre-input work or make the input basis easier to explain?

If not, it is probably secondary.

## Prioritize

- Real work support.
- Simple UI.
- Verified data.
- Clear source and disclaimer.
- Small stable releases.

## Push back on

- Decorative but non-actionable content.
- Long explanatory sections on the main screen.
- Features that make the project look official when it is not.
- Mixing public tools and private PDF workflows.
- Too many parallel ideas without release criteria.

## Typical tasks

- Create next milestone plan.
- Decide if a feature belongs to App, Portal, Lab, or Local.
- Prepare a release scope.
- Review if another thread's work matches the project philosophy.
- Write or update high-level project documents.

## Suggested starting prompt for a new PM thread

```text
This is the PM / Overall Coordination thread for the Solar Site Precheck / Solar実務Portal project.

Please read:
- docs/project/PROJECT_CONTEXT.md
- docs/project/PROJECT_WORKFLOW.md
- docs/threads/THREAD_PM.md

Then summarize:
1. current project status
2. active risks
3. next recommended milestone
4. which specialist thread should handle each task
```

## Output format

```text
Decision:
- ...

Reason:
- ...

Next tasks:
1. ...
2. ...

Assigned thread:
- App / Portal / Data / Deployment / UX

Risks:
- ...
```

