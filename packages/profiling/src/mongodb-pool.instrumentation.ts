import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from "@opentelemetry/instrumentation";
import { profileOperation } from "./profiling.js";

/** Official MongoDB instrumentation measures commands after checkout. Measure checkout separately. */
export class MongoDBPoolInstrumentation extends InstrumentationBase {
  constructor() {
    super("@aegislog/mongodb-pool", "1.0.0", {});
  }

  protected init(): InstrumentationNodeModuleDefinition {
    return new InstrumentationNodeModuleDefinition("mongodb", [">=7 <8"], undefined, undefined, [
      new InstrumentationNodeModuleFile(
        "mongodb/lib/cmap/connection_pool.js",
        [">=7 <8"],
        (exports) => {
          this._wrap(
            exports.ConnectionPool.prototype,
            "checkOut",
            (original) =>
              function (this: unknown, ...args: unknown[]) {
                return profileOperation("mongodb.pool.checkout", "db_pool", () =>
                  original.apply(this, args),
                );
              },
          );
          return exports;
        },
        (exports) => {
          this._unwrap(exports.ConnectionPool.prototype, "checkOut");
        },
      ),
    ]);
  }
}
