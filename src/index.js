import { parse } from "node-html-parser";
import { checkValue, ObjectId } from "@cocreate/utils";

// Using a Set for O(1) lookups is cleaner and faster than an object map
const IGNORE_ELEMENTS = new Set([
    "INPUT", "TEXTAREA", "SELECT", "LINK", "IFRAME", "COCREATE-SELECT"
]);

// Prevent these tags from triggering the generic [src] chunk-fetching logic
const SKIP_SRC_ELEMENTS = new Set([
    "SCRIPT", "IMG", "IFRAME", "AUDIO", "VIDEO", "SOURCE", "TRACK", "INPUT", "EMBED", "FRAME"
]);

// CSS Selector for identifying target elements
const RENDER_SELECTOR = "[array], [src]:not(script, img, iframe, audio, video, source, track, input, embed, frame)";

/**
 * Main functional entry point for Server-Side Rendering.
 * Completely stateless—all required dependencies are passed directly as arguments.
 * * @param {Object} options
 * @param {Object} options.file - The template file object containing source markup
 * @param {Object} options.organization - Organization configuration data
 * @param {Object} options.urlObject - Request URL parsed object
 * @param {string} options.langRegion - Target language region (e.g., 'en-US')
 * @param {string} options.lang - Target language (e.g., 'en')
 * @param {string} options.theme - Visual theme (e.g., 'dark')
 * @param {Function} options.resolveFile - Injected custom file resolver callback
 * @param {Object} options.crud - Crud database service instance
 * @returns {Promise<string>} The fully rendered HTML string
 */
export async function HTML({
    file,
    organization,
    urlObject,
    langRegion,
    lang,
    theme,
    resolveFile,
    crud
}) {
    let dep = [];
    let dbCache = new Map();
    
    const organization_id = file?.organization_id;
    const host = urlObject?.hostname;

    // Ensure file.path has a fallback to prevent runtime properties errors
    const filePath = file?.path || file?.pathname || "/";

    // Apply parsing directly on root file source without modifying any paths
    let rootSrc = file?.src || "";
    let dom = parse(rootSrc);

    // Core Render Function (placed at the top for prominence)
    async function render(currentDom, lastKey) {
        // Find target elements and filter out nested targets to prevent redundant querying 
        const elements = currentDom.querySelectorAll(RENDER_SELECTOR).filter(el => {
            return !el.parentNode || !el.parentNode.closest(RENDER_SELECTOR);
        });

        for (let el of elements) {
            let isData = el.hasAttribute("array");
            let isSrc = el.hasAttribute("src") && !SKIP_SRC_ELEMENTS.has(el.tagName.toUpperCase());

            let chunkDom = null;

            // 1. Process File Source (Takes priority over Data Source)
            if (isSrc) {
                let src = el.getAttribute("src");
                if (src) {
                    let pathname = filePath;
                    if (!pathname.endsWith("/")) pathname += "/";
                    
                    pathname = new URL(src, `http://localhost${pathname}`).pathname;
                    if (pathname.endsWith("/")) pathname += "index.html";

                    // CIRCULAR DEPENDENCY CHECK: Track active src resolution paths in loop prevention list
                    let srcKey = `file:${pathname}`;
                    if (dep.includes(srcKey)) {
                        throw new Error(`Infinite loop detected: Parent context "${lastKey}" requested "${srcKey}", which is already in the active import chain.`);
                    }
                    dep.push(srcKey);

                    let fetchedFile = null;

                    // Use injected resolver callback if provided, otherwise fallback to CRUD query
                    if (typeof resolveFile === "function") {
                        fetchedFile = await resolveFile(pathname);
                    } else if (crud) {
                        let data = await crud.send({
                            method: "object.read",
                            host,
                            array: "files",
                            object: "",
                            $filter: { query: { pathname } },
                            organization_id
                        });
                        fetchedFile = data?.object?.[0] || null;
                    }

                    // Intelligent Status Code Handling
                    let statusCode = fetchedFile?.status;
                    if (!statusCode) {
                        if (!fetchedFile || !fetchedFile.src) statusCode = 404;
                        else if (fetchedFile.public === false || String(fetchedFile.public) === "false") statusCode = 403;
                        else statusCode = 200;
                    }

                    if (statusCode >= 400) {
                        el.setAttribute("error", statusCode.toString());
                    } 

                    // Render if status is successful OR if the element explicitly forces rendering errors via 'render-error'
                    if (statusCode < 400 || el.hasAttribute("render-error")) {
                        let chunkVal = fetchedFile?.src;

                        if (chunkVal) {
                            // Decode base64 SVG if necessary
                            if (typeof chunkVal === "string" && chunkVal.startsWith("data:image/svg+xml;base64,")) {
                                chunkVal = Buffer.from(chunkVal.split(",")[1], "base64").toString("utf-8");
                            }

                            // Normalize non-string values safely to strings before parsing (failsafe)
                            let chunkStr = typeof chunkVal === 'string' ? chunkVal : String(chunkVal);
                            chunkDom = parse(chunkStr);

                            // Extract and merge any embedded <head> parameters before rendering nested items
                            extractAndMergeHead(chunkDom, dom);
                            
                            // Passing dynamic srcKey instead of static "src-chunk" to preserve trace context
                            chunkDom = await render(chunkDom, srcKey);
                        }
                    }
                    dep.pop(); // Complete tracking cycle for this source resolution
                }
            }
            // 2. Process Data Source (Only runs if element does not have a valid src being resolved)
            else if (isData) {
                let shouldProcessData = true;

                // Exclude specific tags, templates, actions, and components from rendering
                if (IGNORE_ELEMENTS.has(el.tagName.toUpperCase())) {
                    shouldProcessData = false;
                } else if (el.closest(".template, [template], template, [render]")) {
                    shouldProcessData = false;
                } else if (el.hasAttribute("render-query") || el.hasAttribute("component") || el.hasAttribute("plugin") || el.hasAttribute("actions")) {
                    shouldProcessData = false;
                }

                if (shouldProcessData && crud) {
                    let array = el.getAttribute("array");
                    let key = el.getAttribute("key"); // Optional attribute
                    let _id = el.getAttribute("object") || "";
                    
                    let $filter = {};
                    let filterAttr = el.getAttribute("filter");
                    if (filterAttr) {
                        try {
                            $filter = JSON.parse(filterAttr);
                        } catch (e) {
                            $filter = {};
                        }
                    }

                    if (array && checkValue(array) && (!key || checkValue(key))) {
                        let keyStr = key ? `-${key}` : '';
                        let filterKeyStr = filterAttr ? `-${filterAttr}` : '';
                        let crudKey = `${_id}${array}${keyStr}${filterKeyStr}`;
                        
                        if (dep.includes(crudKey)) {
                            throw new Error(`Infinite loop detected: Parent context "${lastKey}" requested data key "${crudKey}", which has already been rendered.`);
                        }
                        dep.push(crudKey);

                        let cacheKey = `${_id}${array}${filterKeyStr}`;
                        let data;
                        
                        if (dbCache.has(cacheKey)) {
                            data = dbCache.get(cacheKey);
                        } else {
                            data = await crud.send({
                                method: "object.read",
                                host,
                                array,
                                object: _id ? { _id } : "",
                                $filter,
                                organization_id
                            });
                            if (data?.object?.[0]) data = data.object[0];
                            dbCache.set(cacheKey, data);
                        }

                        if (data) {
                            // If a key is defined, fetch that key's value; otherwise, render the entire object/document
                            let chunkVal = key ? data[key] : data;

                            if (chunkVal !== undefined && chunkVal !== null) {
                                // Normalize objects to JSON strings, and everything else safely to standard strings
                                let chunkStr = typeof chunkVal === 'object' ? JSON.stringify(chunkVal) : String(chunkVal);
                                chunkDom = parse(chunkStr);

                                // Extract and merge any embedded <head> parameters before rendering nested items
                                extractAndMergeHead(chunkDom, dom);

                                // Recursively resolve all nested requirements in the chunk BEFORE inserting it
                                chunkDom = await render(chunkDom, crudKey);
                            }
                        }
                        dep.pop();
                    }
                }
            }

            // Apply DOM mutations only after everything in this sub-tree branch is completely resolved
            if (chunkDom) {
                if (el.getAttribute("value-type") === "outerHTML") {
                    if (chunkDom.childNodes?.length) {
                        el.replaceWith(...chunkDom.childNodes);
                    } else {
                        el.remove();
                    }
                } else {
                    el.setAttribute("rendered", "");
                    el.innerHTML = "";
                    
                    // Use node-html-parser compatible appendChild loop
                    if (chunkDom.childNodes) {
                        for (const child of [...chunkDom.childNodes]) {
                            el.appendChild(child);
                        }
                    } else {
                        el.appendChild(chunkDom);
                    }
                }
            }
        }

        return currentDom;
    }

    // Initialize recursion tracker with the primary file pathname to catch immediate self-reference imports
    const rootNormalizedPath = filePath.endsWith("/") ? `${filePath}index.html` : filePath;
    dep.push(`file:${rootNormalizedPath}`);

    dom = await render(dom, "root");
    
    if (langRegion || lang) {
        dom = translate(dom, file, langRegion, lang);
    }

    // Apply theme data-attributes/meta-tags if a head is available, or can be lazily resolved
    if (theme) {
        const htmlEl = dom.querySelector("html");
        try {
            if (htmlEl?.setAttribute) htmlEl.setAttribute("data-bs-theme", theme);

            const currentHead = dom.querySelector("head");
            if (currentHead) {
                let meta = currentHead.querySelector('meta[name="color-scheme"]');
                if (meta?.setAttribute) {
                    meta.setAttribute("content", theme);
                } else {
                    const metaNode = parse(`<meta name="color-scheme" content="${theme}">`);
                    currentHead.appendChild(metaNode);
                }
            }
        } catch (e) {
            // fail-safe
        }
    }

    // Append localization link tags if head is present, or can be lazily resolved
    if (organization?.languages?.length > 0) {
        let langLinkTags = createLanguageLinkTags(file, organization, urlObject);
        const currentHead = dom.querySelector("head");
        if (currentHead && langLinkTags) {
            const linksFragment = parse(langLinkTags);
            for (const link of linksFragment.querySelectorAll("link")) {
                currentHead.appendChild(link);
            }
        }
    }

    dep = [];
    dbCache.clear();
    
    let finalHtml = dom.toString();

    // Apply ObjectId generation globally across the fully rendered document
    finalHtml = finalHtml.replaceAll("ObjectId()", () => ObjectId().toString());

    return finalHtml;
}

// ==========================================
// Stateless Private Helper Functions
// ==========================================

function ensureMainHead(rootDom) {
    let head = rootDom.querySelector("head");
    if (!head) {
        const htmlEl = rootDom.querySelector("html") || rootDom;
        const headDom = parse("<head></head>");
        head = headDom.querySelector("head");
        if (htmlEl.childNodes && htmlEl.childNodes.length > 0) {
            htmlEl.insertBefore(head, htmlEl.childNodes[0]);
        } else {
            htmlEl.appendChild(head);
        }
    }
    return head;
}

function getMatchingSelector(newEl) {
    const tagName = newEl.tagName.toUpperCase();
    if (tagName === "TITLE") {
        return "title";
    }
    if (tagName === "META") {
        const name = newEl.getAttribute("name");
        if (name) return `meta[name="${name}"]`;
        const property = newEl.getAttribute("property");
        if (property) return `meta[property="${property}"]`;
    }
    if (tagName === "SCRIPT") {
        const type = newEl.getAttribute("type");
        if (type === "application/ld+json") {
            return 'script[type="application/ld+json"]';
        }
        const id = newEl.getAttribute("id");
        if (id) return `script[id="${id}"]`;
    }
    if (tagName === "LINK") {
        const rel = newEl.getAttribute("rel");
        if (rel === "canonical") {
            return 'link[rel="canonical"]';
        }
        const id = newEl.getAttribute("id");
        if (id) return `link[id="${id}"]`;
    }
    return null;
}

function extractAndMergeHead(chunkDom, rootDom) {
    const chunkHead = chunkDom.querySelector("head");
    if (!chunkHead) return;

    // Lazily ensure a main head exists on the root 'dom' since we found nested head assets to merge
    const head = ensureMainHead(rootDom);

    // Clone array of nodes to safely mutate during iteration
    const children = [...chunkHead.childNodes];

    for (const child of children) {
        if (child.nodeType === 1) { // Element Node
            const selector = getMatchingSelector(child);
            let matched = false;
            if (selector) {
                const existing = head.querySelector(selector);
                if (existing) {
                    existing.replaceWith(child);
                    matched = true;
                }
            }
            if (!matched) {
                head.appendChild(child);
            }
        } else {
            // For text, script content, or comment nodes, append straight to main head
            head.appendChild(child);
        }
    }

    // Remove empty nested head container from the chunk
    chunkHead.remove();
}

function createLanguageLinkTags(file, organization, urlObject) {
    let generatedLinksString = `<link rel="alternate" hreflang="x-default" href="https://${urlObject.hostname}${file.pathname}">\n`;
    for (const language of organization.languages) {
        const hrefUrl = `https://${urlObject.hostname}/${language}${file.pathname}`;
        generatedLinksString += `<link rel="alternate" hreflang="${language}" href="${hrefUrl}">\n`;
    }
    return generatedLinksString;
}

function translate(dom, file, langRegion, lang) {
    if (!file?.translations || (!langRegion && !lang)) return dom;

    for (let translation of file.translations) {
        let elements = dom.querySelectorAll(translation.selector) || [];
        for (let el of elements) {
            if (!el) continue;
            
            if (translation.innerHTML) {
                let content = translation.innerHTML[langRegion] || translation.innerHTML[lang];
                if (content) el.innerHTML = content;
            }
            
            if (translation.attributes) {
                for (let [key, languageObj] of Object.entries(translation.attributes)) {
                    let value = languageObj[langRegion] || languageObj[lang];
                    if (value) el.setAttribute(key, value);
                }
            }
        }
    }
    return dom;
}