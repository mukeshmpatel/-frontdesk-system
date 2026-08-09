# AAIQ Release 47 Rollback

## Scope

Release 47 adds the protected Sample Environment Library, clone API, sample data builders, navigation entry, audit records, tests, and release documentation.

## Application rollback

1. Select the previously saved Sites version in the deployment history.
2. Deploy that saved version to production.
3. Verify `/api/health` and the canonical application shell.
4. Record the rollback reason and affected release.

## Data rollback

The protected template is additive. Clones are isolated by their generated property UUID and recorded in `sample_environment_clones` and `sample_environment_audit`.

Do not delete cloned property data automatically. To retire a clone:

1. Suspend access to the cloned property.
2. Export its records and audit history.
3. Verify no real records were added after cloning.
4. Archive or remove the clone using a separately approved, property-scoped migration.

The locked original template must not be edited or deleted. A new template version replaces it while preserving prior versions.

## Verification

- Run `npm test`.
- Run `npm run build`.
- Confirm the previous production deployment is healthy.
- Confirm no unrelated property records changed.

