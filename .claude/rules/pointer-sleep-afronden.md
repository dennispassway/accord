# Een sleep eindigt ook zonder pointerup

Geldt voor: `src/features/prs/ResizeHandle.tsx` en elke nieuwe pointer-sleep in `src/**`

Een sleep die op `setPointerCapture` draait eindigt op twee manieren: met `pointerup`, of
met `pointercancel` als het OS de pointer afpakt (een systeemgebaar, een aanraking die in
scrollen overgaat, het venster dat de pointer verliest). Beide horen door dezelfde
afronding, maar de toestand waarin ze binnenkomen verschilt.

- Bij `pointercancel` is de capture al losgelaten en telt de pointer niet meer als actief.
  `releasePointerCapture` gooit daar `NotFoundError`. Staat die aanroep vóór de stap die
  de waarde vastlegt, dan haalt die stap het niet: de nieuwe breedte blijft zichtbaar maar
  gaat niet naar de opslag en is na een herlaad weg. Toets eerst met `hasPointerCapture`,
  of ruim pas op nadat je hebt vastgelegd.
- Hetzelfde geldt voor elk opruimwerk dat kan gooien omdat de toestand al weg is. Zet dat
  nooit tussen het einde van de interactie en de stap die het resultaat bewaart.
- Dit pad is hier niet af te dekken met een test: het project heeft geen jsdom of
  testing-library, de component-tests draaien op `renderToStaticMarkup` en kennen geen
  events. De reden moet dus in een comment naast de check staan, anders haalt de volgende
  opruimronde hem weg.
