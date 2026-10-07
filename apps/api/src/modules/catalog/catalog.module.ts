import { Module } from "@nestjs/common";

import { ExamsService } from "./application/exams.service.js";
import { TaxonomyService } from "./application/taxonomy.service.js";
import { CATALOG_LOOKUP } from "./catalog.contract.js";
import { CATALOG_STORE } from "./domain/ports.js";
import { DrizzleCatalogLookup } from "./infrastructure/drizzle-catalog-lookup.js";
import { DrizzleCatalogStore } from "./infrastructure/drizzle-catalog-store.js";
import { AdminExamsController } from "./presentation/admin-exams.controller.js";
import { AdminTaxonomyController } from "./presentation/admin-taxonomy.controller.js";
import { ExamsController } from "./presentation/exams.controller.js";

/**
 * Exam Catalog: exams and their versioned taxonomy.
 *
 * One module rather than separate `exams` and `taxonomy` modules because they
 * form one aggregate (DOMAIN_MODEL.md §2 "Exam Catalog"), and splitting them
 * would create a dependency cycle: a taxonomy version needs its exam, and
 * activating an exam needs a published taxonomy.
 */
@Module({
  controllers: [ExamsController, AdminExamsController, AdminTaxonomyController],
  providers: [
    ExamsService,
    TaxonomyService,
    { provide: CATALOG_STORE, useClass: DrizzleCatalogStore },
    { provide: CATALOG_LOOKUP, useClass: DrizzleCatalogLookup },
  ],
  // Other modules depend on the read contract, not on catalog services.
  exports: [CATALOG_LOOKUP],
})
export class CatalogModule {}
