/**
 * Eén fouttype voor alles wat stukgaat vóórdat GitHub antwoordt: geen
 * netwerk, hostnaam niet op te lossen, verbinding weg, TLS stuk, of te traag.
 *
 * De aanleiding is dat WKWebView (de webview van Tauri op macOS) elk van die
 * gevallen op één string gooit, `TypeError: Load failed`, en dat die string
 * ongefilterd in de banner "Verversen mislukt: ..." belandde. Gemeten in een
 * WKWebView op macOS 26.6.2:
 *
 *   DNS-fout                       => TypeError | Load failed
 *   verbinding weg tijdens de body => TypeError | Load failed
 *   door CSP geblokkeerd           => TypeError | Load failed
 *   AbortSignal.timeout()          => AbortError | Fetch is aborted
 *
 * Die laatste is de reden dat een test op `name === "TimeoutError"` nooit
 * afgaat in de echte app: WebKit wijkt daar af van de spec.
 */

/** Waar het misging. Alleen `timeout` en `connectionLost`/`offline` zijn uit
 * een webview-fout af te leiden; `dns` en `tls` komen van een transport dat
 * de oorzaak wél kent. */
export type NetworkErrorKind =
  | "offline"
  | "dns"
  | "connectionLost"
  | "tls"
  | "timeout"
  | "unknown";

const MESSAGES: Record<NetworkErrorKind, string> = {
  offline: "Geen internetverbinding.",
  dns: "GitHub is niet bereikbaar, de hostnaam kon niet worden opgezocht.",
  connectionLost: "Geen verbinding met GitHub.",
  tls: "De beveiligde verbinding met GitHub kwam niet tot stand.",
  timeout: "GitHub reageerde niet binnen 15 seconden, probeer het opnieuw.",
  unknown: "De verbinding met GitHub ging onderweg mis.",
};

/** Kinds die van een tweede poging beter worden. Een TLS-fout en een
 * onbekende fout staan er bewust niet bij: die herhalen kost alleen tijd. */
const TRANSIENT: ReadonlySet<NetworkErrorKind> = new Set<NetworkErrorKind>([
  "offline",
  "dns",
  "connectionLost",
  "timeout",
]);

function messageForKind(kind: NetworkErrorKind): string {
  return MESSAGES[kind];
}

export function isTransientKind(kind: NetworkErrorKind): boolean {
  return TRANSIENT.has(kind);
}

/** Technische fout in de transportlaag, met een melding die een gebruiker
 * iets zegt. `cause` houdt de oorspronkelijke fout vast voor de console. */
export class NetworkError extends Error {
  readonly kind: NetworkErrorKind;
  readonly cause: unknown;

  constructor(kind: NetworkErrorKind, cause?: unknown) {
    super(messageForKind(kind));
    this.name = "NetworkError";
    this.kind = kind;
    this.cause = cause;
  }
}

/** Herkent de netwerkfouten die een webview-`fetch` gooit, zowel de afgebroken
 * aanvraag als de generieke `TypeError`. Geeft `null` terug voor alles wat
 * geen transportfout is, zodat de aanroeper die ongemoeid kan doorgooien. */
export function asNetworkError(
  error: unknown,
  options: { online?: boolean } = {},
): NetworkError | null {
  if (error instanceof NetworkError) return error;

  const name = (error as { name?: string } | null)?.name;
  if (name === "AbortError" || name === "TimeoutError") {
    return new NetworkError("timeout", error);
  }

  if (error instanceof TypeError) {
    const online = options.online ?? navigatorOnline();
    return new NetworkError(online ? "connectionLost" : "offline", error);
  }

  return null;
}

/**
 * Voert één transportstap uit en vertaalt een netwerkfout naar een
 * `NetworkError`. Gebruik dit ook om het lezen van de body te omhullen: die
 * loopt over dezelfde verbinding, dus een verbinding die na de headers
 * wegvalt gooit daar en niet bij de fetch zelf.
 */
export async function withNetworkError<T>(step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (error) {
    throw asNetworkError(error) ?? error;
  }
}

/** `navigator.onLine` staat op een captive portal gewoon op `true`, dus dit
 * bepaalt alleen de woordkeuze, nooit of er een poging gedaan wordt. */
function navigatorOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}
