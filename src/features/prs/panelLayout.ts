/** Breedte van de twee zijpanelen, in CSS-pixels. */
export interface PanelWidths {
  sidebar: number;
  detail: number;
}

/** De breedtes waar de panelen op stonden voordat ze versleepbaar werden. */
export const DEFAULT_PANELS: PanelWidths = { sidebar: 216, detail: 340 };

export const PANEL_BOUNDS: Record<
  keyof PanelWidths,
  { min: number; max: number }
> = {
  sidebar: { min: 180, max: 360 },
  detail: { min: 280, max: 520 },
};

/**
 * Wat de lijstkolom minimaal overhoudt. 384px is de breedte die overbleef op
 * het smalste venster (940px) met de oude vaste panelen, en dus de smalste
 * rij die ooit is nagerekend: daaronder loopt .pl-row-end over en knipt
 * .cockpit-panes hem af. Zodra de rij op vaste kolommen staat en aantoonbaar
 * smaller kan, mag dit getal omlaag.
 */
export const LIST_MIN = 384;

/**
 * Nieuwe breedte voor één paneel tijdens het slepen. Het andere paneel blijft
 * staan waar het staat: de ruimte komt uit de lijstkolom, tot die LIST_MIN
 * raakt. Past zelfs de ondergrens niet meer, dan wint de ondergrens; het
 * venster is dan smaller dan de app toelaat.
 */
export function clampPanel(
  panel: keyof PanelWidths,
  value: number,
  otherWidth: number,
  windowWidth: number,
): number {
  const bounds = PANEL_BOUNDS[panel];
  const room = windowWidth - otherWidth - LIST_MIN;
  return Math.max(bounds.min, Math.min(value, bounds.max, room));
}

/**
 * Beide panelen in één keer passend maken: eerst op hun eigen grenzen, daarna
 * krimpen tot de lijst LIST_MIN haalt. Gebruikt bij het laden van opgeslagen
 * breedtes en na een venstergrootte-wijziging.
 *
 * Het krimpen verdeelt zich over de speling die elk paneel boven zijn
 * ondergrens heeft, zodat een breed detailpaneel meer wijkt dan een sidebar
 * die al bijna op zijn minimum staat.
 */
export function clampPanels(
  panels: PanelWidths,
  windowWidth: number,
): PanelWidths {
  const sidebar = clampToBounds("sidebar", panels.sidebar);
  const detail = clampToBounds("detail", panels.detail);

  const overflow = sidebar + detail + LIST_MIN - windowWidth;
  if (overflow <= 0) return { sidebar, detail };

  const sidebarSlack = sidebar - PANEL_BOUNDS.sidebar.min;
  const detailSlack = detail - PANEL_BOUNDS.detail.min;
  const totalSlack = sidebarSlack + detailSlack;
  if (totalSlack <= 0) {
    return {
      sidebar: PANEL_BOUNDS.sidebar.min,
      detail: PANEL_BOUNDS.detail.min,
    };
  }

  const fromSidebar = Math.min(
    sidebarSlack,
    Math.ceil((overflow * sidebarSlack) / totalSlack),
  );
  const fromDetail = overflow - fromSidebar;
  return {
    sidebar: sidebar - fromSidebar,
    detail: Math.max(PANEL_BOUNDS.detail.min, detail - fromDetail),
  };
}

function clampToBounds(panel: keyof PanelWidths, value: number): number {
  const bounds = PANEL_BOUNDS[panel];
  if (!Number.isFinite(value)) return DEFAULT_PANELS[panel];
  return Math.max(bounds.min, Math.min(value, bounds.max));
}
