# Thread Guide: Data Validation

## Purpose

This thread checks whether project data is reliable enough to use or publish.

It protects the project from plausible but wrong numbers.

## Read first

1. `docs/project/PROJECT_CONTEXT.md`
2. `docs/project/PROJECT_WORKFLOW.md`
3. `docs/threads/THREAD_DATA_VALIDATION.md`
4. `ACCURACY_VALIDATION.md`
5. Relevant source/data files for the task.

## Data areas

- NEDO MONSOLA-11 3rd mesh data.
- Snow 10cm+ occurrence rate.
- GSI elevation / DEM source.
- Horizon analysis assumptions.
- Solar Pro `ObstructionElevations.csv` format.
- JINKO and future module `.MD0W` data.
- Public data source attribution.

## Core rule

If a value cannot be verified, mark it as unknown or draft.

Do not invent:

- Module specs.
- Regional characteristics.
- Solar Pro version compatibility.
- Official source status.
- Engineering guarantee.

## Verification states

Use:

- **Verified**
  - Confirmed in the target software or workflow.

- **Checked**
  - Checked against source documents but not fully tested in software.

- **Draft**
  - Not yet verified. Should not be presented as reliable.

## Typical tasks

- Check a module `.MD0W` against a datasheet.
- Confirm Solar Pro can read a generated file.
- Compare NEDO mesh values against expected location.
- Check if portal text makes unverified claims.
- Review source attribution wording.

## Suggested starting prompt for a new Data Validation thread

```text
This is the Data Validation thread.

Please read:
- docs/project/PROJECT_CONTEXT.md
- docs/project/PROJECT_WORKFLOW.md
- docs/threads/THREAD_DATA_VALIDATION.md

Then list the current data areas that need validation before public release.
```

## Completion report format

```text
Validated:
- ...

Evidence:
- ...

Status:
- Verified / Checked / Draft

Issues:
- ...

Recommended wording:
- ...
```

