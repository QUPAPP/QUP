import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { QuestionsModule } from "../questions/questions.module.js";
import { ImportsService } from "./application/imports.service.js";
import { IMPORT_FILE_STORAGE, IMPORT_STORE } from "./domain/ports.js";
import { DrizzleImportStore } from "./infrastructure/drizzle-import-store.js";
import { LocalImportFileStorage } from "./infrastructure/local-file-storage.js";
import { AdminImportsController } from "./presentation/admin-imports.controller.js";

/**
 * Content import (AGENTS.md §5 "content-import", QUESTION_BANK_IMPORT.md):
 * structured files to DRAFT questions. Owns import_batches and import_items;
 * reads the catalog and writes questions only through their contracts.
 */
@Module({
  imports: [CatalogModule, QuestionsModule],
  controllers: [AdminImportsController],
  providers: [
    ImportsService,
    { provide: IMPORT_STORE, useClass: DrizzleImportStore },
    { provide: IMPORT_FILE_STORAGE, useClass: LocalImportFileStorage },
  ],
})
export class ContentImportModule {}
