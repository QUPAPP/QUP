import { Global, Module } from "@nestjs/common";

import { APP_CONFIG, type AppConfig } from "../../config/app-config.js";
import { LocalObjectStorage } from "./local-object-storage.js";
import { OBJECT_STORAGE, type ObjectStorage } from "./object-storage.js";
import { S3ObjectStorage } from "./s3-object-storage.js";

/** One storage for the whole process, chosen by STORAGE_DRIVER (config/app-config.ts). */
@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): ObjectStorage =>
        config.storage.driver === "s3"
          ? new S3ObjectStorage(config.storage)
          : new LocalObjectStorage(config.storage.directory),
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
