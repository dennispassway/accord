import { openUrl } from "@tauri-apps/plugin-opener";
import Markdown, { type MarkdownToJSX, RuleType } from "markdown-to-jsx";
import type {
  AnchorHTMLAttributes,
  ImgHTMLAttributes,
  JSX,
  ReactNode,
  TableHTMLAttributes,
} from "react";
import { createElement } from "react";

// Tags die zonder gedrag of externe bron veilig als zichzelf mogen renderen.
// Alles wat hier niet in staat en ook niet in DANGEROUS_TAGS voorkomt, is een
// onbekende tag: die verliest zijn omhulsel en toont alleen zijn kinderen
// (zie renderRule hieronder).
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "hr",
  "strong",
  "b",
  "em",
  "i",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "sup",
  "sub",
  "details",
  "summary",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "span",
  "div",
  "del",
  "s",
  "kbd",
]);

// Tags die iets uitvoeren, laden of navigeren: nooit renderen, ook niet hun
// kinderen (die zijn voor deze tags toch code of markup, geen leestekst).
const DANGEROUS_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "video",
  "audio",
  "svg",
  "link",
  "meta",
  "source",
]);

// a en img krijgen hieronder hun eigen override, dus die tellen niet als
// "onbekend" in de renderRule-fallback.
const KNOWN_TAGS = new Set([...ALLOWED_TAGS, ...DANGEROUS_TAGS, "a", "img"]);

function MarkdownLink({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...rest}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        if (href != null) void openUrl(href);
      }}
    >
      {children}
    </a>
  );
}

// De CSP staat alleen img-src 'self' data: toe, dus een externe afbeelding-
// URL laadt nooit: toon in plaats daarvan de alt-tekst als aanwijzing, nooit
// een <img>-element.
function MarkdownImage({ alt }: ImgHTMLAttributes<HTMLImageElement>) {
  // Een leeg alt-attribuut (`alt=""`) parseert markdown-to-jsx als het
  // boolean `true` (aanwezig, geen waarde), niet als lege string.
  if (alt == null || alt === "" || typeof alt !== "string") return null;
  return (
    <span className="inspector-comment-image" title="afbeelding">
      {alt}
    </span>
  );
}

// De comment-kolom mag nooit breder worden dan de inspector: een tabel (het
// GFM-tabel-uiterlijk zelf, of een <table> uit rauwe bot-HTML) krijgt daarom
// een eigen scrollcontainer.
function TableWrapper(props: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="inspector-comment-text-table-wrap">
      <table {...props} />
    </div>
  );
}

const dangerousOverrides = Object.fromEntries(
  [...DANGEROUS_TAGS].map((tag) => [tag, () => null]),
);

// style/class(Name)/id komen uit bot-HTML nooit door, op geen enkel element:
// een style met position: fixed kan de hele app overlayen. Dit is de enige
// plek die dat beslist, createElement loopt voor elk element dat de compiler
// aanmaakt (native tags én de overrides hierboven), dus per-tag stripping is
// hier niet nodig.
const STRIPPED_PROPS = new Set(["style", "class", "className", "id"]);

function sanitizeCreateElement(
  tag: Parameters<typeof createElement>[0],
  props: JSX.IntrinsicAttributes | null,
  ...children: ReactNode[]
): ReactNode {
  const raw = props as Record<string, unknown> | null;
  if (raw == null) return createElement(tag, props, ...children);
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (STRIPPED_PROPS.has(key) || /^on[A-Z]/i.test(key)) continue;
    cleaned[key] = value;
  }
  return createElement(tag, cleaned, ...children);
}

const MARKDOWN_OPTIONS: MarkdownToJSX.Options = {
  // Bot-reacties (Vercel, CI) zijn vaak rauwe HTML; zonder dit staat de
  // markup letterlijk in de inspector. tagfilter uit, want die zou dezelfde
  // tags (script, style, iframe, ...) juist als zichtbare geëscapete tekst
  // tonen in plaats van niets: de renderRule/overrides hieronder zijn de
  // enige plek waar dat wordt beslist.
  disableParsingRawHTML: false,
  tagfilter: false,
  forceBlock: true,
  createElement: sanitizeCreateElement,
  overrides: {
    ...dangerousOverrides,
    a: MarkdownLink,
    img: MarkdownImage,
    table: TableWrapper,
  },
  renderRule(next, node, renderChildren, state) {
    if (
      (node.type === RuleType.htmlBlock ||
        node.type === RuleType.htmlSelfClosing) &&
      !KNOWN_TAGS.has(node.tag.toLowerCase())
    ) {
      // Onbekende, niet-gevaarlijke tag (bv. <picture>, <mark>): geen
      // omhulsel, alleen de inhoud. <source> en de dangerous tags lopen niet
      // via dit pad, die staan al in KNOWN_TAGS.
      return renderChildren(
        "children" in node ? (node.children ?? []) : [],
        state,
      );
    }
    return next();
  },
};

export function CommentBody({ children }: { children: string }): ReactNode {
  return <Markdown options={MARKDOWN_OPTIONS}>{children}</Markdown>;
}
