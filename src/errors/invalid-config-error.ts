import { ConfigError } from "./config-error";

/** The config loaded but breaks a rule, eg a collection name that is not a valid identifier. */
class InvalidConfigError extends ConfigError {
  override name = "InvalidConfigError";
  /** One message per problem. */
  readonly issues: readonly string[];

  constructor(file: string, issues: readonly string[]) {
    super([`${file} is invalid:`, ...issues].join("\n"));
    this.issues = issues;
  }
}

export { InvalidConfigError };
