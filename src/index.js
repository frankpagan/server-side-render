import { checkValue, ObjectId, HTMLScanner } from "@cocreate/utils";

// Elements that should not have generic [src] fetch logic applied
const SKIP_SRC_ELEMENTS = new Set([
  "SCRIPT", "IMG", "IFRAME", "AUDIO", "VIDEO", "SOURCE", "TRACK", "INPUT", "EMBED", "FRAME"
]);

// Element types ignored during data attribute rendering
const IGNORE_ELEMENTS = new Set([
  "FORM", "INPUT", "TEXTAREA", "SELECT", "LINK", "IFRAME", "COCREATE-SELECT"
]);

// Default maximum allowed recursion depth (0 disables the depth limit for infinite scaling)
const DEFAULT_MAX_DEPTH = 25;

/**
 * Extracts <head> content from chunk HTML and merges title, meta, link, script tags into root HTML head.
 * Completely powered by HTMLScanner handles.
 * @param {string} rootHtml - Main host HTML string
 * @param {string} chunkHtml - Fetched chunk HTML string
 * @returns {{ rootHtml: string, cleanChunkHtml: string }}
 */
function extractAndMergeHead(rootHtml, chunkHtml) {
  const chunkDoc = new HTMLScanner(chunkHtml);
  const headHandles = chunkDoc.querySelectorAll({ tags: ["HEAD"] });

  if (headHandles.length === 0) {
    return { rootHtml, cleanChunkHtml: chunkHtml };
  }

  const chunkHeadHandle = headHandles[0];
  const chunkHeadContent = chunkHeadHandle.getInnerHTML();

  // Remove <head> tag from chunk
  chunkHeadHandle.replaceWith("");
  const cleanChunkHtml = chunkDoc.toString();

  const rootDoc = new HTMLScanner(rootHtml);
  const rootHeadHandles = rootDoc.querySelectorAll({ tags: ["HEAD"] });

  if (rootHeadHandles.length > 0) {
    const rootHeadHandle = rootHeadHandles[0];
    const existingContent = rootHeadHandle.getInnerHTML();
    rootHeadHandle.setInnerHTML(`${existingContent}\n${chunkHeadContent}\n`);
    rootHtml = rootDoc.toString();
  } else {
    // Inject <head> into root html tag if missing
    const rootHtmlHandles = rootDoc.querySelectorAll({ tags: ["HTML"] });
    if (rootHtmlHandles.length > 0) {
      const htmlHandle = rootHtmlHandles[0];
      const existingInner = htmlHandle.getInnerHTML();
      htmlHandle.setInnerHTML(`<head>\n${chunkHeadContent}\n</head>\n${existingInner}`);
      rootHtml = rootDoc.toString();
    } else {
      rootHtml = `<head>\n${chunkHeadContent}\n</head>\n` + rootHtml;
    }
  }

  return { rootHtml, cleanChunkHtml };
}

/**
 * Applies theme attribute to <html> tag and injects color-scheme meta tag into <head> using HTMLScanner
 * @param {string} html - Full document HTML string
 * @param {string} theme - Selected theme name (e.g., 'dark')
 * @returns {string} Modified HTML
 */
function applyTheme(html, theme) {
  if (!theme) return html;

  const doc = new HTMLScanner(html);

  // Apply data-bs-theme attribute on <html> element
  const htmlHandles = doc.querySelectorAll({ tags: ["HTML"] });
  if (htmlHandles.length > 0) {
    htmlHandles[0].setAttribute("data-bs-theme", theme);
  }

  // Update or inject <meta name="color-scheme">
  const metaHandles = doc.querySelectorAll({ tags: ["META"] });
  let colorSchemeMeta = metaHandles.find(h => h.getAttribute("name") === "color-scheme");

  if (colorSchemeMeta) {
    colorSchemeMeta.setAttribute("content", theme);
  } else {
    const headHandles = doc.querySelectorAll({ tags: ["HEAD"] });
    if (headHandles.length > 0) {
      const existingHeadContent = headHandles[0].getInnerHTML();
      headHandles[0].setInnerHTML(`${existingHeadContent}\n<meta name="color-scheme" content="${theme}">`);
    }
  }

  return doc.toString();
}

/**
 * Generates <link rel="alternate" ...> tags for organization languages.
 * @param {Object} file - File object
 * @param {Object} organization - Organization metadata
 * @param {Object} urlObject - Request URL
 * @returns {string} Link tags string
 */
function createLanguageLinkTags(file, organization, urlObject) {
  if (!organization?.languages?.length) return "";

  let tags = `<link rel="alternate" hreflang="x-default" href="https://${urlObject.hostname}${file.pathname}">\n`;
  for (const language of organization.languages) {
    const hrefUrl = `https://${urlObject.hostname}/${language}${file.pathname}`;
    tags += `<link rel="alternate" hreflang="${language}" href="${hrefUrl}">\n`;
  }
  return tags;
}

/**
 * Merges target language dictionary entries from a chunk's translation object into the unified translations accumulator.
 * @param {Record<string, Record<string, Object>>} targetMap - Dynamic accumulator map holding merged translations.
 * @param {Record<string, Record<string, Object>>} sourceTranslations - Translation object from a fetched file.
 * @param {string} [langRegion] - Target locale code (e.g., "en-US").
 * @param {string} [lang] - Fallback primary language code (e.g., "en").
 */
function mergeTranslationSource(targetMap, sourceTranslations, langRegion, lang) {
  if (!sourceTranslations) return;

  const targetLangKey = (langRegion && sourceTranslations[langRegion])
    ? langRegion
    : (lang && sourceTranslations[lang])
      ? lang
      : null;

  if (!targetLangKey || !sourceTranslations[targetLangKey]) return;

  if (!targetMap[targetLangKey]) {
    targetMap[targetLangKey] = {};
  }

  Object.assign(targetMap[targetLangKey], sourceTranslations[targetLangKey]);
}

/**
 * Fast Language-First Translator operating directly via HTMLScanner handles.
 * Scans for `[i18n]` attributes and replaces element content and attributes.
 */
function translate(html, translations, langRegion, lang) {
  if (!html || !translations || (!langRegion && !lang)) return html;

  const langDict = translations[langRegion] || translations[lang];
  if (!langDict) return html;

  const doc = new HTMLScanner(html);
  const elements = doc.querySelectorAll({ attributes: ["i18n"] });

  for (const el of elements) {
    const key = el.getAttribute("i18n");
    const values = langDict[key];
    if (!values) continue;

    for (const [attr, value] of Object.entries(values)) {
      if (attr === "text" || value === undefined || value === null) continue;
      el.setAttribute(attr, String(value));
    }

    if (values.text !== undefined && values.text !== null && !el.isSelfClosing) {
      let contentStr = "";
      if (el.tagName === "SCRIPT" && typeof values.text === "object") {
        contentStr = JSON.stringify(values.text, null, 2);
      } else {
        contentStr = String(values.text);
      }
      el.setInnerHTML(contentStr);
    }
  }

  let translatedHtml = doc.toString();

  // Fallback for application/ld+json script if keyed as "ld+json" without explicit attribute
  if (langDict["ld+json"]) {
    const jsonDoc = new HTMLScanner(translatedHtml);
    const scriptHandles = jsonDoc.querySelectorAll({ tags: ["SCRIPT"] });
    for (const el of scriptHandles) {
      if (el.getAttribute("type") === "application/ld+json") {
        const values = langDict["ld+json"];
        const content = values.text || values;
        const scriptContent = typeof content === "object" ? JSON.stringify(content, null, 2) : String(content);
        el.setInnerHTML(scriptContent);
        break;
      }
    }
    translatedHtml = jsonDoc.toString();
  }

  return translatedHtml;
}

/**
 * Main functional entry point for Server-Side Rendering using HTMLScanner.
 * @param {Object} options - SSR options
 * @returns {Promise<string>} Fully rendered and translated HTML string
 */
export async function HTML({
  file,
  organization,
  urlObject,
  langRegion,
  lang,
  theme,
  resolveFile,
  crud,
  maxDepth = DEFAULT_MAX_DEPTH
}) {
  let dep = [];
  const dbCache = new Map();

  // Accumulate translations from root and recursively included files
  let activeTranslations = {};
  if (file?.translations) {
    mergeTranslationSource(activeTranslations, file.translations, langRegion, lang);
  }

  const organization_id = file?.organization_id;
  const host = urlObject?.hostname;
  const rootFilePath = file?.path || file?.pathname || "/";
  let rootHtml = file?.src || "";

  async function renderRecursive(currentHtml, lastKey, currentFilePath) {
    // If maxDepth is 0, depth limiting is disabled and allowed to scale infinitely
    if (maxDepth > 0 && dep.length > maxDepth) {
      throw new Error(`Maximum recursive depth of ${maxDepth} exceeded in SSR rendering chain.`);
    }

    const doc = new HTMLScanner(currentHtml);
    const targets = doc.querySelectorAll({
      attributes: ["src", "array"],
      excludeTags: ["SCRIPT", "IMG", "IFRAME", "AUDIO", "VIDEO", "SOURCE", "TRACK", "INPUT", "EMBED", "FRAME"]
    });

    for (const el of targets) {
      let chunkStr = null;
      const isSrc = el.hasAttribute("src") && !SKIP_SRC_ELEMENTS.has(el.tagName);
      const isData = el.hasAttribute("array");

      // 1. Process File Source [src]
      if (isSrc) {
        let src = el.getAttribute("src");
        if (src && typeof src === "string") {
          let pathname = currentFilePath;
          if (!pathname.endsWith("/")) pathname += "/";

          pathname = new URL(src, `http://localhost${pathname}`).pathname;
          if (pathname.endsWith("/")) pathname += "index.html";

          const srcKey = `file:${pathname}`;
          if (dep.includes(srcKey)) {
            throw new Error(`Infinite loop detected: Parent context "${lastKey}" requested "${srcKey}", which is already in active chain: ${dep.join(" -> ")}`);
          }

          dep.push(srcKey);
          try {
            let fetchedFile = null;
            if (typeof resolveFile === "function") {
              fetchedFile = await resolveFile(pathname);
            } else if (crud) {
              const data = await crud.send({
                method: "object.read",
                host,
                array: "files",
                object: "",
                filter: { query: { pathname } },
                organization_id
              });
              fetchedFile = data?.object?.[0] || null;
            }

            let statusCode = fetchedFile?.status;
            if (!statusCode) {
              if (!fetchedFile || !fetchedFile.src) statusCode = 404;
              else if (fetchedFile.public === false || String(fetchedFile.public) === "false") statusCode = 403;
              else statusCode = 200;
            }

            if (statusCode < 400 || el.hasAttribute("render-error")) {
              if (fetchedFile?.translations) {
                mergeTranslationSource(activeTranslations, fetchedFile.translations, langRegion, lang);
              }

              let val = fetchedFile?.src;
              if (typeof val === "string" && val.startsWith("data:image/svg+xml;base64,")) {
                val = Buffer.from(val.split(",")[1], "base64").toString("utf-8");
              }
              if (val !== undefined && val !== null) {
                chunkStr = String(val);
                const merged = extractAndMergeHead(rootHtml, chunkStr);
                rootHtml = merged.rootHtml;
                chunkStr = await renderRecursive(merged.cleanChunkHtml, srcKey, pathname);
              }
            }
          } finally {
            dep.pop();
          }
        }
      }
      // 2. Process Data Source [array]
      else if (isData) {
        let shouldProcess = true;

        if (IGNORE_ELEMENTS.has(el.tagName)) {
          shouldProcess = false;
        } else if (el.hasAttribute("render-query") || el.hasAttribute("component") || el.hasAttribute("plugin") || el.hasAttribute("actions")) {
          shouldProcess = false;
        }

        if (shouldProcess && crud) {
          const array = el.getAttribute("array");
          const key = el.getAttribute("key");
          const _id = el.getAttribute("object") || "";
          const filterAttr = el.getAttribute("filter");
          let filter = {};

          if (filterAttr) {
            try { filter = JSON.parse(filterAttr); } catch (e) {}
          }

          if (array && checkValue(array) && (!key || checkValue(key))) {
            const keyStr = key ? `-${key}` : "";
            const filterKeyStr = filterAttr ? `-${filterAttr}` : "";
            const crudKey = `data:${_id}${array}${keyStr}${filterKeyStr}`;

            if (dep.includes(crudKey)) {
              throw new Error(`Infinite loop detected: Parent context "${lastKey}" requested data key "${crudKey}", which is already in active chain: ${dep.join(" -> ")}`);
            }

            dep.push(crudKey);
            try {
              const cacheKey = `${_id}${array}${filterKeyStr}`;
              let data;

              if (dbCache.has(cacheKey)) {
                data = dbCache.get(cacheKey);
              } else {
                data = await crud.send({
                  method: "object.read",
                  host,
                  array,
                  object: _id ? { _id } : "",
                  filter,
                  organization_id
                });
                if (data?.object?.[0]) data = data.object[0];
                dbCache.set(cacheKey, data);
              }

              if (data) {
                const chunkVal = key ? data[key] : data;
                if (chunkVal !== undefined && chunkVal !== null) {
                  const rawChunk = typeof chunkVal === "object" ? JSON.stringify(chunkVal) : String(chunkVal);
                  const merged = extractAndMergeHead(rootHtml, rawChunk);
                  rootHtml = merged.rootHtml;
                  chunkStr = await renderRecursive(merged.cleanChunkHtml, crudKey, currentFilePath);
                }
              }
            } finally {
              dep.pop();
            }
          }
        }
      }

      if (chunkStr !== null) {
        if (el.getAttribute("value-type") === "outerHTML") {
          el.replaceWith(chunkStr);
        } else {
          el.setAttribute("rendered", "");
          el.setInnerHTML(chunkStr);
        }
      }
    }

    return doc.toString();
  }

  const rootNormalizedPath = rootFilePath.endsWith("/") ? `${rootFilePath}index.html` : rootFilePath;
  dep.push(`file:${rootNormalizedPath}`);

  try {
    rootHtml = await renderRecursive(rootHtml, "root", rootNormalizedPath);

    // Apply translations to full composite string
    if (langRegion || lang) {
      rootHtml = translate(rootHtml, activeTranslations, langRegion, lang);
    }

    // Apply visual theme
    if (theme) {
      rootHtml = applyTheme(rootHtml, theme);
    }

    // Inject localization alternate links into <head>
    if (organization?.languages?.length > 0) {
      const langLinks = createLanguageLinkTags(file, organization, urlObject);
      if (langLinks) {
        const doc = new HTMLScanner(rootHtml);
        const headHandles = doc.querySelectorAll({ tags: ["HEAD"] });
        if (headHandles.length > 0) {
          const headContent = headHandles[0].getInnerHTML();
          headHandles[0].setInnerHTML(`${headContent}\n${langLinks}`);
          rootHtml = doc.toString();
        }
      }
    }
  } finally {
    dep = [];
    dbCache.clear();
  }

  // Replace ObjectId() tokens across final rendered document
  return rootHtml.replaceAll("ObjectId()", () => ObjectId().toString());
}