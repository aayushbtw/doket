import { ConfigError } from "./config-error";

class InvalidConfigError extends ConfigError {
  override name = "InvalidConfigError";
  readonly issues: readonly string[];

  constructor(file: string, issues: readonly string[]) {
    super([`${file} is invalid:`, ...issues].join("\n"));
    this.issues = issues;
  }
}

export { InvalidConfigError };
