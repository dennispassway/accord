import { describe, expect, it, vi } from "vitest";
import { NetworkError } from "./networkError";
import { createTauriFetch } from "./tauriFetch";

describe("createTauriFetch", () => {
  it("stuurt methode, headers en body door naar het Rust-commando", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ status: 200, headers: {}, body: "{}" });
    const fetchImpl = createTauriFetch(invoke);

    await fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: "Bearer t",
        "Content-Type": "application/json",
      },
      body: '{"query":"x"}',
    });

    expect(invoke).toHaveBeenCalledWith("github_request", {
      request: {
        url: "https://api.github.com/graphql",
        method: "POST",
        headers: {
          Authorization: "Bearer t",
          "Content-Type": "application/json",
        },
        body: '{"query":"x"}',
      },
    });
  });

  it("gaat uit van GET als er geen methode is meegegeven", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ status: 200, headers: {}, body: "" });

    await createTauriFetch(invoke)("https://api.github.com/user", {});

    const [, args] = invoke.mock.calls[0] as [
      string,
      { request: { method: string } },
    ];
    expect(args.request.method).toBe("GET");
  });

  it("bouwt een Response waar status, headers en body uit te lezen zijn", async () => {
    const invoke = vi.fn().mockResolvedValue({
      status: 403,
      headers: { "retry-after": "30", "content-type": "application/json" },
      body: '{"message":"rate limited"}',
    });

    const response = await createTauriFetch(invoke)(
      "https://api.github.com/x",
      {
        method: "GET",
      },
    );

    expect(response.status).toBe(403);
    expect(response.ok).toBe(false);
    expect(response.headers.get("retry-after")).toBe("30");
    await expect(response.json()).resolves.toEqual({ message: "rate limited" });
  });

  it("maakt van een 204 een geldige Response zonder body", async () => {
    // new Response("", { status: 204 }) gooit: een 204 mag geen body hebben.
    const invoke = vi
      .fn()
      .mockResolvedValue({ status: 204, headers: {}, body: "" });

    const response = await createTauriFetch(invoke)(
      "https://api.github.com/x",
      {
        method: "DELETE",
      },
    );

    expect(response.status).toBe(204);
  });

  it("vertaalt het kind uit Rust naar een NetworkError met Nederlandse melding", async () => {
    const invoke = vi
      .fn()
      .mockRejectedValue({ kind: "dns", message: "dns error: no record" });

    const error = await createTauriFetch(invoke)("https://api.github.com/x", {
      method: "GET",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).kind).toBe("dns");
    expect((error as NetworkError).message).not.toContain("dns error");
  });

  it("leest connect en body als een verbroken verbinding", async () => {
    for (const kind of ["connect", "body"]) {
      const invoke = vi.fn().mockRejectedValue({ kind, message: "boom" });
      const error = await createTauriFetch(invoke)("https://api.github.com/x", {
        method: "GET",
      }).catch((e: unknown) => e);
      expect((error as NetworkError).kind).toBe("connectionLost");
    }
  });

  it("valt terug op unknown bij een kind dat de frontend niet kent", async () => {
    const invoke = vi
      .fn()
      .mockRejectedValue({ kind: "iets-nieuws", message: "boom" });

    const error = await createTauriFetch(invoke)("https://api.github.com/x", {
      method: "GET",
    }).catch((e: unknown) => e);

    expect((error as NetworkError).kind).toBe("unknown");
  });
});
