import { describe, expect, it } from "vitest";
import { asNetworkError, isTransientKind, NetworkError } from "./networkError";

describe("asNetworkError", () => {
  it("leest een afgebroken fetch als timeout, ook onder de naam die WebKit gebruikt", () => {
    // WKWebView laat AbortSignal.timeout() afbreken met AbortError
    // ("Fetch is aborted"), niet met de TimeoutError uit de spec.
    const aborted = new DOMException("Fetch is aborted", "AbortError");
    expect(asNetworkError(aborted)?.kind).toBe("timeout");
  });

  it("leest de TimeoutError uit de spec ook als timeout", () => {
    const timedOut = new DOMException(
      "The operation timed out.",
      "TimeoutError",
    );
    expect(asNetworkError(timedOut)?.kind).toBe("timeout");
  });

  it("leest WebKits 'Load failed' als een verbroken verbinding", () => {
    // De generieke netwerkfout van WKWebView: een DNS-fout, een verbinding die
    // wegvalt en een body die halverwege afbreekt geven alle drie deze
    // TypeError, zonder onderscheid.
    const loadFailed = new TypeError("Load failed");
    expect(asNetworkError(loadFailed, { online: true })?.kind).toBe(
      "connectionLost",
    );
  });

  it("leest 'Failed to fetch' uit een Chromium-webview net zo", () => {
    const failedToFetch = new TypeError("Failed to fetch");
    expect(asNetworkError(failedToFetch, { online: true })?.kind).toBe(
      "connectionLost",
    );
  });

  it("noemt een netwerkfout offline zodra de browser zegt dat er geen verbinding is", () => {
    const loadFailed = new TypeError("Load failed");
    expect(asNetworkError(loadFailed, { online: false })?.kind).toBe("offline");
  });

  it("geeft null terug voor een fout die geen netwerkfout is", () => {
    const business = new Error("GitHub rejected the token");
    business.name = "AuthError";
    expect(asNetworkError(business)).toBeNull();
  });

  it("geeft een NetworkError met een Nederlandse melding, niet de engine-tekst", () => {
    const error = asNetworkError(new TypeError("Load failed"), {
      online: true,
    });
    expect(error).toBeInstanceOf(NetworkError);
    expect(error?.message).not.toContain("Load failed");
    expect(error?.message).toMatch(/verbinding/i);
  });

  it("houdt de oorspronkelijke fout als cause vast", () => {
    const original = new TypeError("Load failed");
    expect(asNetworkError(original, { online: true })?.cause).toBe(original);
  });

  it("houdt de bestaande Nederlandse timeout-tekst aan", () => {
    const error = asNetworkError(
      new DOMException("Fetch is aborted", "AbortError"),
    );
    expect(error?.message).toMatch(/GitHub reageerde niet binnen 15 seconden/);
  });
});

describe("isTransientKind", () => {
  it("merkt de kinds aan die het opnieuw proberen waard zijn", () => {
    expect(isTransientKind("offline")).toBe(true);
    expect(isTransientKind("dns")).toBe(true);
    expect(isTransientKind("connectionLost")).toBe(true);
    expect(isTransientKind("timeout")).toBe(true);
  });

  it("merkt een TLS-fout en een onbekende fout niet als transiënt aan", () => {
    expect(isTransientKind("tls")).toBe(false);
    expect(isTransientKind("unknown")).toBe(false);
  });
});
