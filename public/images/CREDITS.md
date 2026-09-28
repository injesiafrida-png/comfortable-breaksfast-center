# Image credits

Product photos used on this site, and the licence each one requires.

## Locally hosted (`public/images/products/`)

These four are stored in this repository and served by Vite, rather than
hotlinked from Wikimedia. Hotlinking `upload.wikimedia.org` returns HTTP 429
under normal traffic and breaks cards when Wikimedia rate-limits a visitor.

| File | Product | Source | Photographer | Licence |
|---|---|---|---|---|
| `chapati.jpg` | Chapati | [Wikimedia Commons — 2 Chapati warm and ready to be eaten.jpg](https://commons.wikimedia.org/wiki/File:2_Chapati_warm_and_ready_to_be_eaten.jpg) | KittyKaht | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `mandazi.jpg` | Mandazi | [Wikimedia Commons — Mandazi Production.JPG](https://commons.wikimedia.org/wiki/File:Mandazi_Production.JPG) | SkyJumperNr1 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `corns.jpg` | Corns | [Wikimedia Commons — Grilled Corn on the cob.JPG](https://commons.wikimedia.org/wiki/File:Grilled_Corn_on_the_cob.JPG) | Namitakhaire | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `bread.jpg` | Bread | [Wikimedia Commons — Fresh slices of bread arranged on a baking tray in a kitchen setting.jpg](https://commons.wikimedia.org/wiki/File:Fresh_slices_of_bread_arranged_on_a_baking_tray_in_a_kitchen_setting.jpg) | Shixart1985 | [CC BY 2.0](https://creativecommons.org/licenses/by-sa/2.0/deed.en) |
| `pizza.jpg` | Pizza | [Wikimedia Commons — Pizza-3007395.jpg](https://commons.wikimedia.org/wiki/File:Pizza-3007395.jpg) | igorovsyannykov | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — public domain, attribution optional |
| `sausages.jpg` | Sausages | [Wikimedia Commons — DFC 1093 Two grilled sausages served with creamy potato salad and a side of coleslaw on a white plate.jpg](https://commons.wikimedia.org/wiki/File:DFC_1093_Two_grilled_sausages_served_with_creamy_potato_salad_and_a_side_of_coleslaw_on_a_white_plate.jpg) | PattayaPatrol | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `biscuits.jpg` | Biscuits | [Wikimedia Commons — Bourbon and Custard Cream.jpeg](https://commons.wikimedia.org/wiki/File:Bourbon_and_Custard_Cream.jpeg) | GOLDIEM J | Public domain — no attribution required |

### Attribution requirement

Attribution is legally required for the CC BY and CC BY-SA images: **chapati,
mandazi, corns, bread and sausages**. It is optional for `pizza.jpg` (CC0) and
not required for `biscuits.jpg` (public domain), though crediting those is
still good practice.

The site footer carries a **Photo credits** link pointing at this file, so the
credit reaches visitors rather than living only in the repository. The
per-photographer, per-licence detail is in the table above.

If you would rather satisfy the licence without relying on a link, inline the
credits as a tooltip or caption on each product card. That is stricter and
some CC BY-SA reviewers prefer it for commercial sites.

## Remote (`https://images.unsplash.com/...`)

No product currently uses a remote image. All nine are hosted in this
repository. Cakes and Eggs are the only ones still on Unsplash stock
photography, which permits commercial use and does not require attribution.

## Not in use

Big Eggs, Cooking Oil and Sugar were removed from the menu by migration
`20260928174500_update_menu_lineup.sql`. Their former Wikimedia images are no
longer referenced anywhere in the code or the database.
