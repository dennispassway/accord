# Boek een onomkeerbare stap voordat je op de volgende afbreekt

Geldt voor: `src/lib/github/**`

Lussen als `runStackMerge` doen per stap meerdere dingen achter elkaar: eerst iets
onomkeerbaars op GitHub (mergen, force-pushen), daarna een vervolgactie die kan falen
(de rebase van de stapel erboven, een refresh). Faalt die vervolgactie, dan is de eerste
actie nog steeds gebeurd.

- Zet de registratie van een geslaagde onomkeerbare actie in de teller of het resultaat
  vóór de foutafhandeling van de vervolgstap, niet aan het eind van de iteratie. Anders
  onderschat het resultaat wat er echt is gebeurd en meldt de UI bijvoorbeeld
  "1 van 3 gemerged" terwijl er twee PR's dicht staan.
- De sturing van de lus (stoppen, stopreden, welke PR) hangt af van de vervolgstap; het
  gemelde aantal hangt af van wat al is uitgevoerd. Hou die twee gescheiden.
- Een bestaande test die het te lage aantal verwacht legt de bug vast in plaats van de
  spec. Benoem dat expliciet als je hem aanpast, met in de test een comment over wat er
  op GitHub werkelijk gebeurd is.
