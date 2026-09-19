import { describe, expect, it } from "vitest";

import { CliError } from "../src/lib/cli-error";
import { githubToken, dispatchWorkflow, hubRepo } from "../src/lib/dispatch";

describe("hubRepo", () => {
  it("flag beats env beats default", () => {
    expect(hubRepo(undefined)).toBe("Webioinfo01/agentx-hub-dev");
    process.env.AGENTX_HUB_REPO = "octocat/from-env";
    expect(hubRepo(undefined)).toBe("octocat/from-env");
    expect(hubRepo("octocat/from-flag")).toBe("octocat/from-flag");
    delete process.env.AGENTX_HUB_REPO;
  });
});

describe("githubToken", () => {
  it("prefers GITHUB_TOKEN then GH_TOKEN", () => {
    delete process.env.GH_TOKEN;
    process.env.GITHUB_TOKEN = "gh1";
    expect(githubToken()).toBe("gh1");
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = "gh2";
    expect(githubToken()).toBe("gh2");
    delete process.env.GH_TOKEN;
    expect(githubToken()).toBeUndefined();
  });
});

describe("dispatchWorkflow", () => {
  it("POSTs the dispatch payload with auth when a token exists", async () => {
    const seen: Array<{
      url: string;
      init: RequestInit;
    }> = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    const message = await dispatchWorkflow("octo/hub", "sync-db.yml", "dev", {
      fetch: fakeFetch,
      token: "tok",
    });
    expect(seen[0]!.url).toBe(
      "https://api.github.com/repos/octo/hub/actions/workflows/sync-db.yml/dispatches",
    );
    expect(seen[0]!.init.method).toBe("POST");
    expect(JSON.parse(seen[0]!.init.body as string)).toEqual({ ref: "dev" });
    expect((seen[0]!.init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok",
    );
    expect(message).toContain("Dispatched sync-db.yml to octo/hub (ref dev)");
  });

  it("surfaces HTTP failures as CliError with the body", async () => {
    const fakeFetch = (async () =>
      new Response("workflow not found", { status: 404 })) as unknown as typeof fetch;
    await expect(
      dispatchWorkflow("octo/hub", "nope.yml", "main", {
        fetch: fakeFetch,
        token: undefined,
      }),
    ).rejects.toThrow(/HTTP 404.*workflow not found/);
  });
});
