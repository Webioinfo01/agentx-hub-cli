import { describe, expect, it } from "vitest";

import { helpText, main } from "../src/cli";

describe("helpText", () => {
  it("lists every ops command and points curation at awescholar", () => {
    const help = helpText();
    for (const verb of ["sync", "moderate", "mirror"]) {
      expect(help).toContain(verb);
    }
    expect(help).toContain("-v, --version");
    expect(help).toContain("awescholar verify --agentx");
    expect(help).not.toContain("enrich-papers"); // old curation surface is gone
  });
});

describe("main", () => {
  it("returns 1 and prints help for an unknown command", async () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (line: string) => errors.push(line);
    try {
      expect(await main(["snapshot"])).toBe(1); // old curation verb, now unknown
    } finally {
      console.error = original;
    }
    expect(errors.join("\n")).toContain('Unknown command "snapshot"');
  });

  it("returns 0 for --version", async () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (line: string) => lines.push(line);
    try {
      expect(await main(["-v"])).toBe(0);
    } finally {
      console.log = original;
    }
    expect(lines[0]).toMatch(/^agentx \d+\.\d+\.\d+$/);
  });
});
