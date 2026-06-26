# Cloud Functions

This directory contains WeChat CloudBase functions for the Yidian Sports mini program.

## Current Task Scope

`T02` initializes the cloud function structure only. Business rules, database writes,
error-code mapping, date calculations, audit persistence, validators, and statistics
are implemented in later tasks.

## Structure

```text
cloudfunctions/
  yidianApi/
    index.js
    package.json
    common/
      auth.js
      response.js
      errors.js
      date.js
      audit.js
      validators.js
      stats.js
    domains/
      auth.js
      group.js
      target.js
      checkin.js
      review.js
      photo.js
      systemJob.js
```

`yidianApi` is a unified entry point. It dispatches actions to domain modules so
shared code is deployed together with the cloud function.
