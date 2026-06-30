# Database Setup

This file is the T05 implementation artifact for the WeChat CloudBase database.
It does not write data to any environment.

## Collections

Create these collections in the CloudBase console:

1. `users`
2. `groups`
3. `memberships`
4. `targetConfigs`
5. `checkinRecords`
6. `archiveSnapshots`
7. `archiveMemberSnapshots`
8. `auditLogs`
9. `contentReviewTasks`

The field and index source of truth is [database.schema.json](./database.schema.json).

## Indexes

Configure the indexes listed in `database.schema.json` for each collection.
Indexes marked `"unique": true` represent uniqueness requirements from
Technical Design. If the CloudBase environment cannot enforce a specific unique
index shape, the corresponding cloud function must still re-read and reject
duplicates before writing.

## Initialization Rules

- Do not insert test records into production collections.
- Do not physically delete core business records during initialization or reset.
- Use separate development and production CloudBase environments.
- Keep `auditLogs` unavailable to ordinary mini program pages.
- Store uploaded checkin and makeup photos in cloud storage, not in the mini
  program package and not as database binary payloads.

## Required Permission Direction

Core write operations must go through cloud functions. Mini program pages and
components must not write these collections directly:

- `groups`
- `memberships`
- `targetConfigs`
- `checkinRecords`
- `archiveSnapshots`
- `archiveMemberSnapshots`
- `auditLogs`
- `contentReviewTasks`

## Verification

Before enabling business testing, confirm:

- Every collection above exists.
- Every index in `database.schema.json` is configured or has an equivalent
  server-side duplicate check.
- Cloud functions can read and write the development environment.
- Production environment contains no test garbage data.
