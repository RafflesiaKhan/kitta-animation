# Asset sources for video creation

Free sources Kitta can call from the app server to fill a project's asset library. Each pick has an API, so the Director (step 6) can search and save assets as a validated project action. Licences and limits come from the providers' pages and directories as of November 2026. Check each one on the provider's own site before shipping, and save every asset's source and licence in its asset record.

## Two picks per category

| Category | Pick | API | Licence of the assets | Notes |
| --- | --- | --- | --- | --- |
| Human illustration | **DiceBear** | `api.dicebear.com/9.x/<style>/svg?seed=…`, or the MIT `@dicebear/core` library offline | Per style: Open Peeps is CC0; check each other style | No key. Styles include Open Peeps, Notionists, Personas, Micah, Avataaars. Busts only, no full bodies. |
| Human illustration | **Open Peeps / Humaaans files in the project** | None: bundle the SVG parts and pick parts in code | Open Peeps CC0; Humaaans licence unconfirmed | Humaaans has no API. Use Open Peeps for faces and busts and Humaaans as the full-body reference until its licence is confirmed. |
| Icons | **Iconify** | `api.iconify.design/<set>/<icon>.svg`, search at `/search?query=` | Open-source sets; licence per set (MIT, Apache, CC BY…) | No key. Over 100,000 icons. The API is open source, so it can be self-hosted. Save each set's licence. |
| Icons | **The Noun Project** | REST API with an OAuth key | Free use needs attribution; public domain icons need none | Free plan has a monthly call limit. Hand-drawn and varied styles that suit explainer videos. |
| GIF | **KLIPY** | REST API with a free key | Per KLIPY's terms | Replaced Tenor for WhatsApp and Discord. Google shut the Tenor API on 30 June 2026, so don't use Tenor. |
| GIF | **GIPHY** | REST API, free beta key (about 100 calls an hour) | GIPHY's terms; a production key may cost money | Biggest catalogue. Must show "Powered by GIPHY". |
| Meme | **memegen.link** | `api.memegen.link/images/<template>/<top>/<bottom>.png` | Code MIT; templates are well-known meme images | No key. Can be self-hosted. |
| Meme | **Imgflip** | `/get_memes` (no login), `/caption_image` (free account login) | Imgflip's terms | Free captions carry a watermark and are public. |
| Colour | **The Color API** (`thecolorapi.com`) | `/id?hex=…`, `/scheme?hex=…&mode=analogic` | Data, no licence issue | No key. Names, conversions and schemes. |
| Colour | **Colormind** (`colormind.io`) | `POST /api/` returns a 5-colour palette, can lock colours | Check its terms for commercial use | No key. AI palettes, including a model trained on film stills. |
| Background music | **Openverse** | `api.openverse.org/v1/audio/?q=…&license=cc0` | CC licences; filter to CC0 or commercial use | No key needed (a free token raises limits). Indexes Jamendo, Freesound and others. |
| Background music | **Pixabay Music** (manual) and **Freesound** (API) | Freesound API needs a key | Pixabay: free commercial use, no credit. Freesound: per sound | The Pixabay API covers images and video, not music, so its music is downloaded by hand into the project. Freesound's API is free only for non-commercial use. |
| Background image | **Pexels** | REST API with a free key (about 200 an hour) | Pexels licence: free commercial use, credit appreciated | Photos and videos. |
| Background image | **Pixabay** | REST API with a free key | Pixabay licence: free commercial use | Has `image_type=illustration` and `vector`, which fit cartoons better than photos. Results must be cached, not hotlinked. |
| Frames | **Pixabay** with `image_type=vector` and **Iconify** | as above | as above | Search "frame", "border", "badge". Simple frames (rounded, film strip, comic panel) are cheaper to draw in code as SVG. |
| Shapes | **`blobs` npm library** and **Iconify** shape sets | Code: generates SVG blobs from a seed | MIT | Blobs, waves and patterns are best generated in code, so they match the project palette and stay vector. |

## How it fits Kitta

- **One server module per provider**, behind one `searchAssets(kind, query)` action, so the Director and the library panel call the same code.
- **Keys** go on the Settings page (step 6) with the LLM keys. Providers that need no key (DiceBear, Iconify, memegen, The Color API, Colormind, Openverse) work without Settings.
- **Download, don't hotlink:** save the file to the project's media directory with its source URL, author and licence, so exports keep working offline and credits can be listed.
- **Credits:** export writes a credits file listing every asset that needs attribution.
- **Style:** one style per project (first-scene decision). Photos from Pexels suit a different project from flat SVG characters; prefer Pixabay illustrations and vectors for cartoons.
