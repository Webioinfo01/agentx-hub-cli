// Shared error type for command-level failures. The message is the full
// user-facing text — usage text for arg errors, guidance for environment
// problems. cli.ts prints it to stderr and exits 1.

export class CliError extends Error {}
