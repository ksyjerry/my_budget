# Area 4 Retrospective

**Completed:** 2026-04-25

## What worked / didn't

### Worked
- Backend fixes were straightforward — export header rename + partial column upload + error accumulation
- `test_members_export_columns.py` RED→GREEN confirmed the fix correctly
- Existing test `test_export_returns_xlsx_content_type` caught the header change and was updated accordingly
- Frontend changes were clean with no new TypeScript errors

### Didn't / Watch out
- ProjectMember model does NOT have a `department` field — export needed Employee lookup
- Worktree has no node_modules so tsc uses main project's — pre-existing errors in src/lib/tests files (not from this Area's changes)

## Tests added
- frontend/tests/regression/test_step2_member_search_team_column.spec.ts (#88)
- frontend/tests/regression/test_step2_excel_upload_partial_columns.spec.ts (#73, skipped)
- frontend/tests/regression/test_step2_excel_upload_error_aggregation.spec.ts (#87, skipped)
- frontend/tests/regression/test_step2_placeholder_member.spec.ts (#102)
- backend/tests/regression/test_members_export_columns.py (#72)

## Sign-off — Area 5 진입 가능
- [ ] All Phase E green
- [ ] User confirmed
