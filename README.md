# CoCreate-server-side-render

A high-performance, stateless, and functional server-side rendering (SSR) engine for JavaScript applications. It parses HTML markup structures dynamically, resolves nested sub-file templates or raw database document attributes recursively, prevents infinite circular loop paths, and dynamically handles contextual overrides for translations, theme variations, and metadata layout configurations.

---

## Table of Contents

* [Features](#features)
* [Installation](#installation)
* [Usage](#usage)
* [How it Works](#how-it-works)
* [HTML Schema & Selectors](#html-schema--selectors)
* [Announcements](#announcements)
* [Roadmap](#roadmap)
* [How to Contribute](#how-to-contribute)
* [About](#about)
* [License](#license)

---

## Features

* **Stateless Recursive Engine:** Processes complex DOM layouts recursively via standard parameters, remaining entirely decoupled from active thread states.
* **Dual-Matrix Resolution:** Simultaneously matches, fetches, and hooks HTML target layouts from secondary files (`src`) and structured database rows (`array`/`object`) in a single pass.
* **Infinite Loop Protection:** Tracks active ingestion routes inside structural resolution loops, instantly throwing explicit error exceptions before cyclical references cause crashes.
* **Intelligent Metadata Harvesting:** Extracts deep `<head>`, `<title>`, canonical `<link>`, and targeting `<meta>` records from individual content components and patches them into the primary document frame.
* **On-the-Fly Localization:** Maps custom multi-regional translations to target components using structural element dictionaries, while generating explicit alternative international web connections (`hreflang`).
* **Global ID Tokenization:** Scans compiled output buffers post-render to tokenize all standard `ObjectId()` template markers with live database identifiers.

---

## Installation

```bash
npm install @cocreate/server-side-render
```

> [!NOTE]
> All core underlying dependencies (including DOM parsing utilities like `node-html-parser`) are managed natively and installed automatically.

---

## Usage

### JavaScript API

Inject your rendering context parameters directly into the exported stateless asynchronous `HTML` entry hook:

```javascript
import { HTML } from '@cocreate/server-side-render';

const templateContext = {
  src: `
    <html>
      <head>
        <title>Primary Viewport</title>
      </head>
      <body>
        <!-- External File Component Placement -->
        <div src="/components/navbar.html"></div>

        <!-- Database-Driven Reactive Field Injection -->
        <h1 array="posts" object="64b9a32e18f21bc56789abcd" key="title">Loading Title...</h1>
      </body>
    </html>
  `,
  pathname: "/pages/dashboard.html",
  organization_id: "current-organization-id-string"
};

const fullHtmlResponse = await HTML({
  file: templateContext,
  organization: { languages: ['en', 'es', 'de'] },
  urlObject: new URL('https://mydomain.com/pages/dashboard.html'),
  lang: 'en',
  theme: 'dark',
  crud: yourCrudDatabaseInstance // Handles internal document requests
});

console.log(fullHtmlResponse);
```

---

## How it Works

1. **DOM Structuring:** Converts raw template string streams into a lightweight traversable server-side virtual DOM structure using ultra-fast parser adapters.
2. **Target Scoping:** Identifies structural elements requiring injection by parsing the document body against the layout rule match set: `[array], [src]:not(...)`.
3. **File Dependency Splicing:** Prioritizes structural layouts matching active path variables (`src`) by looking up data records via an optional custom `resolveFile` handler or matching records via the active `crud` data controller.
4. **Data Attribute Evaluation:** Evaluates active object definitions (`array`, `object`, `key`), retrieves data entries through cached communication tunnels, and loads data contents straight into target content layouts.
5. **Head Compilation:** Extracts individual layout variables discovered inside nested sub-views, and compares properties against parent parameters to replace or append structural SEO elements like tags, styles, and descriptions.
6. **Post-Processing Transformations:** Sets localization properties, establishes the page `color-scheme` theme hook, and normalizes text markers matching `ObjectId()` with fresh production parameters.

---

## HTML Schema & Selectors

The module monitors specific markup conditions to differentiate between standard layout fragments and active component models.

### Target Engine Rules

The template processor continuously evaluates elements that match the following selector footprint:

```css
[array], [src]:not(script, img, iframe, audio, video, source, track, input, embed, frame)
```

### Skipped & Ignored Elements

To preserve natural browser actions and prevent unintended payload generation, certain element layouts are isolated from data or stream processing:

| Constraint Group | Targets Blocked / Skipped |
| --- | --- |
| **Data Skip (`IGNORE_ELEMENTS`)** | `FORM`, `INPUT`, `TEXTAREA`, `SELECT`, `LINK`, `IFRAME`, `COCREATE-SELECT` |
| **Source Skip (`SKIP_SRC_ELEMENTS`)** | `SCRIPT`, `IMG`, `IFRAME`, `AUDIO`, `VIDEO`, `SOURCE`, `TRACK`, `INPUT`, `EMBED`, `FRAME` |
| **Contextual Parent Guards** | Any element placed inside `.template`, `[template]`, `template`, `[render]`, `[render-query]`, `[component]`, `[plugin]`, or `[actions]` containers. |

### Attribute Configurations

| Attribute Key | Expected Value | Output Result Behavior |
| --- | --- | --- |
| `src` | `String` (File URL Path) | Triggers nested HTML template fragment fetch operations and tree inclusion. |
| `array` | `String` (Collection ID) | Specifies the target database collection name for document resolution. |
| `object` | `String` (Hex/ID) | Explicitly targets an individual row ID inside the collection map. |
| `key` | `String` (Object Path) | Selects a specific database attribute key value to inject into the element's content. |
| `filter` | `JSON String` | Passes explicit lookup query metrics directly into the operational database read pass. |
| `value-type` | `"outerHTML"` | Instructs the parser to completely drop the outer wrapper node when replacing contents. |
| `render-error` | *Presence Flag* | Forces the view to render markup contents even if target status headers return error codes (≥ 400). |
| `rendered` | `"true"` | Added by SSR after content is inserted so the browser does not fetch and render the element again. |

The file server forwards the request's `X-State` header to SSR as `state`. SSR
includes that state in nested file and data CRUD envelopes so state-dependent
queries can resolve before the HTML is returned.

---

## Announcements

All updates, architecture changes, and performance optimization details are documented in our `CHANGELOG.md` and the [CoCreate Server Side Render GitHub Releases](https://github.com/CoCreate-app/CoCreate-server-side-render/releases) page.

---

## Roadmap

If you are interested in the future direction of this project, please take a look at our open issues and pull requests on the repository. We welcome community input on scaling caching strategies and extending streaming chunk processors.

---

## How to Contribute

We encourage contribution to our libraries (you might even score some nifty swag), please see our [CONTRIBUTING.md](https://github.com/CoCreate-app/CoCreate-server-side-render/blob/master/CONTRIBUTING.md) guide for details. If you encounter any bugs or wish to make feature requests, please submit an issue on our [GitHub Issues](https://github.com/CoCreate-app/CoCreate-server-side-render/issues) tracker. We want this library to be community-driven, and CoCreate led. We need your help to realize this goal.

For broader system configurations and API guides, please visit our [CoCreate Server Side Render Documentation](https://cocreatejs.com/docs/server-side-render).

---

## About

`@cocreate/server-side-render` is designed, built, and supported by the CoCreate Developer Experience Team.

> [!NOTE]
> Please contact the Developer Experience Team via [GitHub Discussions](https://github.com/CoCreate-app/CoCreate-server-side-render/discussions) or join our Discord channel for any architecture or deployment queries.

`@cocreate/server-side-render` is maintained and funded by CoCreate. The names and logos for CoCreate are trademarks of CoCreate, LLC.

---

## License

This software is dual-licensed under the GNU Affero General Public License version 3 (AGPLv3) and a commercial license.

* **Open Source Use:** For open-source projects and non-commercial use, this software is available under the AGPLv3. For the full license text, see the LICENSE file.
* **Commercial Use:** For-profit companies and individuals intending to use this software for commercial purposes must obtain a commercial license. The commercial license is available when you sign up for an API key on our website.
```

## Value transformations

Fetched `src` and CRUD fragments use the shared value handlers from
`@cocreate/utils` before nested includes are rendered. Use `value-*` for shared
transformations or `set-value-*` for insertion-only transformations. Setter
attributes override the corresponding shared attributes; `get-value-*` does not
run during server rendering.

```html
<header
    src="/components/offcanvas-app/header.html"
    value-replace="/\{\{app\.name\}\}/g"
    value-replacement="APIs"
    value-type="outerHtml"></header>
```

Both `outerHtml` and `outerHTML` replace the include element itself.
