// Catalog items of driven-tests/ against the in-browser fake backend (fresh seed in every test).
// The same tests run against the real stack in cypress/e2e-api/04-checklist.cy.ts.
import { checklistSuite } from '../shared/checklist'

checklistSuite()
