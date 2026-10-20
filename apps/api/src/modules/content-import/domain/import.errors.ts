import { DomainError } from "../../../common/errors/domain-error.js";

/** Why a file was refused. Stable values clients translate. */
export type ImportFileProblem =
  | "NOT_UTF8"
  | "BINARY_CONTENT"
  | "MALFORMED"
  | "EMPTY"
  | "TOO_MANY_ROWS"
  | "TOO_MANY_COLUMNS"
  | "CELL_TOO_LONG"
  | "ZIP_TOO_LARGE"
  | "NO_WORKSHEET";

export class ImportFileTypeUnsupported extends DomainError {
  readonly code = "IMPORT_FILE_TYPE_UNSUPPORTED";
  readonly kind = "RULE_VIOLATION";

  constructor() {
    super("Upload a .csv, .tsv, .json or .xlsx file.");
  }
}

export class ImportFileTooLarge extends DomainError {
  readonly code = "IMPORT_FILE_TOO_LARGE";
  readonly kind = "RULE_VIOLATION";
  override readonly details: { maxBytes: number };

  constructor(maxBytes: number) {
    super("The file is larger than an import allows.");
    this.details = { maxBytes };
  }
}

export class ImportFileInvalid extends DomainError {
  readonly code = "IMPORT_FILE_INVALID";
  readonly kind = "RULE_VIOLATION";
  override readonly details: { reason: ImportFileProblem };

  constructor(reason: ImportFileProblem) {
    super(`The file cannot be read: ${reason}.`);
    this.details = { reason };
  }
}

export class ImportNotFound extends DomainError {
  readonly code = "IMPORT_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The import was not found.");
  }
}

export class ImportItemNotFound extends DomainError {
  readonly code = "IMPORT_ITEM_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The import row was not found.");
  }
}

/** A mapped column the file lacks, or a required field left unmapped. */
export class ImportMappingInvalid extends DomainError {
  readonly code = "IMPORT_MAPPING_INVALID";
  readonly kind = "RULE_VIOLATION";
  override readonly details: { fields: string[] };

  constructor(fields: string[]) {
    super("The column mapping does not fit this file.");
    this.details = { fields };
  }
}

/** Drafts were created from this batch; its rows are no longer re-read. */
export class ImportAlreadyImported extends DomainError {
  readonly code = "IMPORT_ALREADY_IMPORTED";
  readonly kind = "CONFLICT";

  constructor() {
    super("Drafts were already created from this import.");
  }
}

export class ImportItemNotResolvable extends DomainError {
  readonly code = "IMPORT_ITEM_NOT_RESOLVABLE";
  readonly kind = "CONFLICT";

  constructor(status: string, action: string) {
    super(`A ${status} row cannot be marked ${action}.`);
  }
}

export class ImportTaxonomyVersionNotFound extends DomainError {
  readonly code = "TAXONOMY_VERSION_NOT_FOUND";
  readonly kind = "NOT_FOUND";

  constructor() {
    super("The taxonomy version does not exist or is archived.");
  }
}
