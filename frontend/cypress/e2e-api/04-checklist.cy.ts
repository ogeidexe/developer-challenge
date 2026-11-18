// Catalog items of driven-tests/ against the REAL stack (docker compose). Every write happens in a sandbox
// cost center created by the run, so the seed stays untouched and a second run on the same database passes.
import { checklistSuite } from '../shared/checklist'

checklistSuite()
