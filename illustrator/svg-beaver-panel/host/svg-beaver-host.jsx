var SVGBeaverPanel = SVGBeaverPanel || {};

(function (exports) {
    exports.getStatus = function () {
        try {
            if (app.documents.length === 0) {
                return stringify({
                    ok: true,
                    documentName: "No open document",
                    selectionCount: 0,
                    targetMode: "artboard"
                });
            }

            var doc = app.activeDocument;
            var selectionItems = getExportableSelection(doc);

            return stringify({
                ok: true,
                documentName: doc.name,
                selectionCount: selectionItems.length,
                targetMode: selectionItems.length > 0 ? "selection" : "artboard"
            });
        } catch (error) {
            return stringifyError(error);
        }
    };

    exports.exportCurrent = function (optionsJson) {
        var destination = null;

        try {
            if (app.documents.length === 0) {
                throw new Error("No open Illustrator document found.");
            }

            var doc = app.activeDocument;
            var options = parseOptions(optionsJson);

            if (options.exportMode === "separate") {
                return stringify(exportSeparateSelection(doc, options));
            }

            var rendered = renderCurrentSvg(doc, options);
            var suggestedDestination = getSuggestedExportFile(doc);

            destination = suggestedDestination.saveDlg("Export web-optimized SVG");
            if (!destination) {
                return stringify({
                    ok: false,
                    error: "Export cancelled."
                });
            }

            destination = ensureSvgExtension(destination);
            writeTextFile(destination, rendered.svg);

            return stringify({
                ok: true,
                path: destination.fsName,
                mode: rendered.mode
            });
        } catch (error) {
            return stringifyError(error);
        }
    };

    exports.generateOutput = function (optionsJson) {
        try {
            if (app.documents.length === 0) {
                throw new Error("No open Illustrator document found.");
            }

            var doc = app.activeDocument;
            var options = parseOptions(optionsJson);

            if (options.exportMode === "separate") {
                throw new Error("Generate is only available in combined export mode.");
            }

            var rendered = renderCurrentSvg(doc, options);
            return stringify({
                ok: true,
                output: buildOutputContent(rendered.svg, options.outputFormat),
                outputFormat: options.outputFormat,
                mode: rendered.mode
            });
        } catch (error) {
            return stringifyError(error);
        }
    };

    function parseOptions(optionsJson) {
        var defaults = {
            coordinatePrecision: 3,
            useCurrentColorFill: true,
            useCurrentColorStroke: true,
            outlineText: true,
            includeXmlns: true,
            exportMode: "combined",
            outputFormat: "raw"
        };

        if (!optionsJson) {
            return defaults;
        }

        var parsed = typeof JSON !== "undefined" && JSON.parse ? JSON.parse(optionsJson) : eval("(" + optionsJson + ")");
        return {
            coordinatePrecision: toIntOrDefault(parsed.coordinatePrecision, defaults.coordinatePrecision),
            useCurrentColorFill: parsed.useCurrentColorFill !== false,
            useCurrentColorStroke: parsed.useCurrentColorStroke !== false,
            outlineText: parsed.outlineText !== false,
            includeXmlns: parsed.includeXmlns !== false,
            exportMode: parsed.exportMode === "separate" ? "separate" : "combined",
            outputFormat: parsed.outputFormat === "dataUri" ? "dataUri" : "raw"
        };
    }

    function renderCurrentSvg(documentRef, options) {
        var tempDoc = null;

        try {
            var exportContext = buildExportContext(documentRef);
            tempDoc = exportContext.usesTemporaryDocument ? exportContext.documentRef : null;

            return {
                svg: renderSvgFromContext(exportContext, options),
                mode: exportContext.usesTemporaryDocument ? "selection" : "artboard"
            };
        } finally {
            closeTemporaryDocument(tempDoc);
        }
    }

    function buildExportContext(documentRef) {
        if (hasExportableSelection(documentRef)) {
            return buildSelectionExportContext(documentRef, getExportableSelection(documentRef));
        }

        return {
            documentRef: documentRef,
            bounds: getActiveArtboardBounds(documentRef),
            usesTemporaryDocument: false
        };
    }

    function buildSelectionExportContext(documentRef, selectionItems) {
        if (!selectionItems.length) {
            throw new Error("The current selection cannot be exported.");
        }

        var bounds = getCombinedVisibleBounds(selectionItems);
        var width = bounds.right - bounds.left;
        var height = bounds.top - bounds.bottom;

        if (width <= 0 || height <= 0) {
            throw new Error("The current selection has no visible size.");
        }

        var temporaryDocument = app.documents.add(documentRef.documentColorSpace, width, height, 1);
        var duplicatedItems = [];
        var i = 0;

        for (i = 0; i < selectionItems.length; i += 1) {
            duplicatedItems.push(selectionItems[i].duplicate(temporaryDocument, ElementPlacement.PLACEATEND));
        }

        var tempBounds = getCombinedVisibleBounds(duplicatedItems);
        var translateX = -tempBounds.left;
        var translateY = height - tempBounds.top;

        for (i = 0; i < duplicatedItems.length; i += 1) {
            duplicatedItems[i].translate(translateX, translateY);
        }

        temporaryDocument.artboards[0].artboardRect = [0, height, width, 0];

        return {
            documentRef: temporaryDocument,
            usesTemporaryDocument: true,
            bounds: {
                left: 0,
                top: height,
                right: width,
                bottom: 0,
                width: width,
                height: height
            }
        };
    }

    function exportSeparateSelection(documentRef, options) {
        var selectionItems = getExportableSelection(documentRef);
        var targetFolder = null;
        var exportedCount = 0;
        var usedNames = {};
        var i = 0;

        if (!selectionItems.length) {
            throw new Error("Select at least one object for separate export.");
        }

        targetFolder = Folder.selectDialog("Choose a folder for separate SVG export");
        if (!targetFolder) {
            return {
                ok: false,
                error: "Export cancelled."
            };
        }

        for (i = 0; i < selectionItems.length; i += 1) {
            exportSingleSelectionItem(documentRef, selectionItems[i], i, targetFolder, usedNames, options);
            exportedCount += 1;
        }

        return {
            ok: true,
            count: exportedCount,
            folderPath: targetFolder.fsName,
            mode: "separate"
        };
    }

    function exportSingleSelectionItem(documentRef, item, index, targetFolder, usedNames, options) {
        var tempDoc = null;

        try {
            var exportContext = buildSelectionExportContext(documentRef, [item]);
            tempDoc = exportContext.documentRef;
            var sanitizedSvg = renderSvgFromContext(exportContext, options);
            var baseName = makeUniqueName(getItemExportName(item, index), usedNames);
            var destination = resolveNonOverwritingFile(new File(targetFolder.fsName + "/" + baseName + ".svg"));

            writeTextFile(destination, sanitizedSvg);
        } finally {
            closeTemporaryDocument(tempDoc);
        }
    }

    function renderSvgFromContext(exportContext, options) {
        var tempFolder = createTempFolder();

        try {
            var tempBaseFile = new File(tempFolder.fsName + "/export");
            exportSvg(exportContext.documentRef, tempBaseFile, options, exportContext.usesTemporaryDocument);

            var exportedFile = findExportedSvgFile(tempFolder);
            if (!exportedFile || !exportedFile.exists) {
                throw new Error("Illustrator did not create an SVG export.");
            }

            var rawSvg = readTextFile(exportedFile);
            return sanitizeSvg(rawSvg, exportContext.bounds, options);
        } finally {
            cleanupTempFolder(tempFolder);
        }
    }

    function exportSvg(documentRef, baseFile, options, useWholeDocument) {
        var artboardIndex = documentRef.artboards.getActiveArtboardIndex();
        var exportOptions = new ExportOptionsSVG();

        exportOptions.compressed = false;
        exportOptions.coordinatePrecision = options.coordinatePrecision;
        exportOptions.cssProperties = SVGCSSPropertyLocation.PRESENTATIONATTRIBUTES;
        exportOptions.documentEncoding = SVGDocumentEncoding.UTF8;
        exportOptions.DTD = SVGDTDVersion.SVG1_1;
        exportOptions.embedRasterImages = false;
        exportOptions.fontSubsetting = SVGFontSubsetting.GLYPHSUSED;
        applySvgFontType(exportOptions, options.outlineText);
        exportOptions.includeFileInfo = false;
        exportOptions.includeUnusedStyles = false;
        exportOptions.includeVariablesAndDatasets = false;
        exportOptions.optimizeForSVGViewer = false;
        exportOptions.preserveEditability = false;
        exportOptions.slices = false;
        exportOptions.sVGAutoKerning = false;
        exportOptions.sVGTextOnPath = false;

        if (useWholeDocument) {
            exportOptions.saveMultipleArtboards = false;
            exportOptions.artboardRange = "";
        } else {
            exportOptions.saveMultipleArtboards = true;
            exportOptions.artboardRange = String(artboardIndex + 1);
        }

        documentRef.exportFile(baseFile, ExportType.SVG, exportOptions);
    }

    function sanitizeSvg(svgText, bounds, options) {
        var width = formatNumber(bounds.width, options.coordinatePrecision);
        var height = formatNumber(bounds.height, options.coordinatePrecision);
        var usesXlink = /xlink:href\s*=/.test(svgText);

        svgText = normalizeLineEndings(svgText);
        svgText = svgText.replace(/^\uFEFF/, "");
        svgText = svgText.replace(/<\?xml[\s\S]*?\?>\s*/gi, "");
        svgText = svgText.replace(/<!DOCTYPE[\s\S]*?>\s*/gi, "");
        svgText = svgText.replace(/<!--[\s\S]*?-->\s*/g, "");
        svgText = removeBlocks(svgText, "metadata");
        svgText = removeBlocks(svgText, "desc");
        svgText = removeBlocks(svgText, "title");
        svgText = removeStyleElements(svgText);
        svgText = sanitizeElementTags(svgText, options);
        svgText = removeEmptyDefs(svgText);
        svgText = removeEmptyGroups(svgText);
        svgText = removeAttributeLessGroups(svgText);
        svgText = removeEmptyGroups(svgText);
        svgText = replaceSvgRoot(svgText, width, height, usesXlink, options.includeXmlns);
        svgText = trimExtraneousWhitespace(svgText);

        return svgText + "\n";
    }

    function sanitizeElementTags(svgText, options) {
        return svgText.replace(/<([A-Za-z][A-Za-z0-9:_-]*)(\s[^<>]*?)?(\/?)>/g, function (match, tagName, rawAttrs, selfClosing) {
            var lowerTagName = tagName.toLowerCase();
            var attrs = rawAttrs || "";

            if (lowerTagName === "svg") {
                return match;
            }

            attrs = expandStyleAttribute(attrs);
            attrs = removeUnwantedAttributes(attrs, lowerTagName);

            if (isDrawableTag(lowerTagName)) {
                attrs = normalizeFillAttribute(attrs, lowerTagName, options.useCurrentColorFill);
                attrs = normalizeStrokeAttribute(attrs, options.useCurrentColorStroke);
            }

            attrs = normalizeAttributeSpacing(attrs);
            return "<" + tagName + attrs + (selfClosing === "/" ? "/" : "") + ">";
        });
    }

    function expandStyleAttribute(attrs) {
        var styleMatch = attrs.match(/\sstyle="([^"]*)"/i);
        if (!styleMatch) {
            return attrs;
        }

        var declarations = styleMatch[1].split(";");
        var result = attrs.replace(/\sstyle="([^"]*)"/i, "");

        for (var i = 0; i < declarations.length; i += 1) {
            var declaration = declarations[i];
            var separatorIndex = declaration.indexOf(":");

            if (separatorIndex === -1) {
                continue;
            }

            var key = trim(declaration.substring(0, separatorIndex));
            var value = trim(declaration.substring(separatorIndex + 1));

            if (!key || !value) {
                continue;
            }

            if (key === "isolation" || key === "enable-background" || key === "mix-blend-mode") {
                continue;
            }

            result = setAttribute(result, key, value);
        }

        return result;
    }

    function removeUnwantedAttributes(attrs, tagName) {
        attrs = removeAttribute(attrs, "id");
        attrs = removeAttribute(attrs, "class");
        attrs = removeAttribute(attrs, "data-name");
        attrs = removeAttribute(attrs, "xmlns:i");
        attrs = removeAttribute(attrs, "xmlns:graph");
        attrs = removeAttribute(attrs, "xml:space");
        attrs = removeAttribute(attrs, "enable-background");
        attrs = removeAttribute(attrs, "version");

        if (tagName === "g") {
            attrs = removeAttribute(attrs, "isolation");
        }

        return attrs;
    }

    function normalizeFillAttribute(attrs, tagName, enabled) {
        if (!enabled) {
            return attrs;
        }

        if (hasAttributeValue(attrs, "fill", "none")) {
            return attrs;
        }

        if (hasAttribute(attrs, "fill")) {
            return setAttribute(attrs, "fill", "currentColor");
        }

        if (tagName === "line") {
            return attrs;
        }

        return setAttribute(attrs, "fill", "currentColor");
    }

    function normalizeStrokeAttribute(attrs, enabled) {
        if (!enabled) {
            return attrs;
        }

        if (!hasAttribute(attrs, "stroke")) {
            return attrs;
        }

        if (hasAttributeValue(attrs, "stroke", "none")) {
            return attrs;
        }

        return setAttribute(attrs, "stroke", "currentColor");
    }

    function replaceSvgRoot(svgText, width, height, usesXlink, includeXmlns) {
        var rootMatch = svgText.match(/<svg\b[^>]*>/i);
        if (!rootMatch) {
            throw new Error("No <svg> root element found.");
        }

        var rootTag = "<svg";
        if (includeXmlns) {
            rootTag += ' xmlns="http://www.w3.org/2000/svg"';
        }
        if (usesXlink) {
            rootTag += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
        }
        rootTag += ' viewBox="0 0 ' + width + ' ' + height + '">';

        return svgText.replace(rootMatch[0], rootTag);
    }

    function removeStyleElements(svgText) {
        return svgText.replace(/<style\b[\s\S]*?<\/style>\s*/gi, "");
    }

    function removeEmptyDefs(svgText) {
        return svgText.replace(/<defs\b[^>]*>\s*<\/defs>\s*/gi, "");
    }

    function removeEmptyGroups(svgText) {
        var previous = null;
        var current = svgText;

        while (previous !== current) {
            previous = current;
            current = current.replace(/<g\b[^>]*>\s*<\/g>\s*/gi, "");
        }

        return current;
    }

    function buildOutputContent(svgText, outputFormat) {
        if (outputFormat === "dataUri") {
            return "data:image/svg+xml," + encodeSvgAsDataUri(svgText);
        }

        return svgText;
    }

    function encodeSvgAsDataUri(svgText) {
        return encodeURIComponent(svgText)
            .replace(/%0A/g, "")
            .replace(/%0D/g, "");
    }

    function removeAttributeLessGroups(svgText) {
        var previous = null;
        var current = svgText;
        var pattern = /<g>\s*((?:(?!<\/?g\b)[\s\S])*)\s*<\/g>\s*/gi;

        while (previous !== current) {
            previous = current;
            current = current.replace(pattern, "$1");
        }

        return current;
    }

    function removeBlocks(svgText, tagName) {
        var pattern = new RegExp("<" + tagName + "\\b[\\s\\S]*?<\\/" + tagName + ">\\s*", "gi");
        return svgText.replace(pattern, "");
    }

    function getActiveArtboardBounds(documentRef) {
        var index = documentRef.artboards.getActiveArtboardIndex();
        var rect = documentRef.artboards[index].artboardRect;
        return {
            left: rect[0],
            top: rect[1],
            right: rect[2],
            bottom: rect[3],
            width: rect[2] - rect[0],
            height: rect[1] - rect[3]
        };
    }

    function getExportableSelection(documentRef) {
        var selection = documentRef.selection || [];
        var items = [];

        for (var i = 0; i < selection.length; i += 1) {
            if (selection[i] && selection[i].visibleBounds) {
                items.push(selection[i]);
            }
        }

        return items;
    }

    function getSuggestedExportFile(documentRef) {
        var exportName = getCombinedExportName(documentRef);
        return new File(Folder.desktop.fsName + "/" + exportName + ".svg");
    }

    function getCombinedExportName(documentRef) {
        var selectionItems = getExportableSelection(documentRef);
        var baseName = "";
        var artboard = null;

        if (selectionItems.length > 0) {
            baseName = getSharedSelectionLayerName(selectionItems);
            if (baseName) {
                return sanitizeFileBaseName(baseName);
            }
            return "selection";
        }

        try {
            artboard = documentRef.artboards[documentRef.artboards.getActiveArtboardIndex()];
            baseName = trim(artboard.name || "");
        } catch (artboardError) {
            baseName = "";
        }

        if (!baseName) {
            baseName = trim(documentRef.name || "");
            baseName = baseName.replace(/\.ai$/i, "");
        }

        return sanitizeFileBaseName(baseName || "export");
    }

    function getItemExportName(item, index) {
        var rawName = "";

        try {
            rawName = item.name || "";
        } catch (nameError) {
            rawName = "";
        }

        if (!trim(rawName)) {
            try {
                rawName = getClosestContainingLayerName(item);
            } catch (layerNameError) {
                rawName = "";
            }
        }

        rawName = trim(rawName);
        if (!rawName) {
            rawName = (item.typename ? item.typename : "item") + "-" + padNumber(index + 1, 2);
        }

        rawName = sanitizeFileBaseName(rawName);

        return rawName || ("item-" + padNumber(index + 1, 2));
    }

    function getSharedSelectionLayerName(selectionItems) {
        var referenceAncestors = null;
        var i = 0;
        var j = 0;

        if (!selectionItems || !selectionItems.length) {
            return "";
        }

        referenceAncestors = getLayerAncestors(selectionItems[0]);
        for (i = referenceAncestors.length - 1; i >= 0; i -= 1) {
            var candidate = referenceAncestors[i];
            var candidateName = "";
            var sharedByAll = true;

            try {
                candidateName = trim(candidate.name || "");
            } catch (candidateNameError) {
                candidateName = "";
            }

            if (!candidateName) {
                continue;
            }

            for (j = 1; j < selectionItems.length; j += 1) {
                if (!isLayerAncestorOfItem(candidate, selectionItems[j])) {
                    sharedByAll = false;
                    break;
                }
            }

            if (sharedByAll) {
                return candidateName;
            }
        }

        return "";
    }

    function getClosestContainingLayerName(item) {
        var ancestors = getLayerAncestors(item);

        if (!ancestors.length) {
            return "";
        }

        try {
            return trim(ancestors[0].name || "");
        } catch (layerNameError) {
            return "";
        }
    }

    function getLayerAncestors(item) {
        var ancestors = [];
        var current = item;

        while (current && current.parent) {
            current = current.parent;

            if (current && current.typename === "Layer") {
                ancestors.push(current);
            }
        }

        return ancestors;
    }

    function isLayerAncestorOfItem(layer, item) {
        var current = item;

        while (current && current.parent) {
            current = current.parent;
            if (current === layer) {
                return true;
            }
        }

        return false;
    }

    function makeUniqueName(baseName, usedNames) {
        var candidate = baseName;
        var counter = 2;

        if (!usedNames[candidate]) {
            usedNames[candidate] = true;
            return candidate;
        }

        while (usedNames[baseName + "-" + counter]) {
            counter += 1;
        }

        candidate = baseName + "-" + counter;
        usedNames[candidate] = true;
        return candidate;
    }

    function hasExportableSelection(documentRef) {
        return getExportableSelection(documentRef).length > 0;
    }

    function getCombinedVisibleBounds(items) {
        var firstBounds = items[0].visibleBounds;
        var left = firstBounds[0];
        var top = firstBounds[1];
        var right = firstBounds[2];
        var bottom = firstBounds[3];

        for (var i = 1; i < items.length; i += 1) {
            var bounds = items[i].visibleBounds;
            left = Math.min(left, bounds[0]);
            top = Math.max(top, bounds[1]);
            right = Math.max(right, bounds[2]);
            bottom = Math.min(bottom, bounds[3]);
        }

        return {
            left: left,
            top: top,
            right: right,
            bottom: bottom,
            width: right - left,
            height: top - bottom
        };
    }

    function isDrawableTag(tagName) {
        return (
            tagName === "path" ||
            tagName === "circle" ||
            tagName === "ellipse" ||
            tagName === "rect" ||
            tagName === "polygon" ||
            tagName === "polyline" ||
            tagName === "line" ||
            tagName === "text" ||
            tagName === "tspan" ||
            tagName === "textpath" ||
            tagName === "use"
        );
    }

    function hasAttribute(attrs, name) {
        var pattern = new RegExp("\\s" + escapeForRegExp(name) + '="[^"]*"', "i");
        return pattern.test(attrs);
    }

    function hasAttributeValue(attrs, name, value) {
        var pattern = new RegExp("\\s" + escapeForRegExp(name) + '="' + escapeForRegExp(value) + '"', "i");
        return pattern.test(attrs);
    }

    function setAttribute(attrs, name, value) {
        var pattern = new RegExp("(\\s" + escapeForRegExp(name) + '=)"[^"]*"', "i");

        if (pattern.test(attrs)) {
            return attrs.replace(pattern, '$1"' + value + '"');
        }

        return attrs + " " + name + '="' + value + '"';
    }

    function removeAttribute(attrs, name) {
        var pattern = new RegExp("\\s" + escapeForRegExp(name) + '="[^"]*"', "gi");
        return attrs.replace(pattern, "");
    }

    function normalizeAttributeSpacing(attrs) {
        if (!attrs) {
            return "";
        }

        attrs = attrs.replace(/\s+/g, " ");
        attrs = attrs.replace(/^\s+|\s+$/g, "");

        return attrs ? " " + attrs : "";
    }

    function normalizeLineEndings(text) {
        return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    }

    function trimExtraneousWhitespace(text) {
        text = text.replace(/[ \t]+\n/g, "\n");
        text = text.replace(/\n{3,}/g, "\n\n");
        return trim(text);
    }

    function findExportedSvgFile(folder) {
        var files = folder.getFiles(function (entry) {
            return entry instanceof File && /\.svg$/i.test(entry.name);
        });

        if (!files || files.length === 0) {
            return null;
        }

        return files[0];
    }

    function createTempFolder() {
        var folder = new Folder(Folder.temp.fsName + "/svg-beaver-panel-" + new Date().getTime());
        if (!folder.exists) {
            folder.create();
        }
        return folder;
    }

    function cleanupTempFolder(folder) {
        if (!folder || !folder.exists) {
            return;
        }

        var entries = folder.getFiles();
        for (var i = 0; i < entries.length; i += 1) {
            try {
                entries[i].remove();
            } catch (cleanupError) {}
        }

        try {
            folder.remove();
        } catch (folderError) {}
    }

    function closeTemporaryDocument(tempDocument) {
        if (!tempDocument) {
            return;
        }

        try {
            tempDocument.close(SaveOptions.DONOTSAVECHANGES);
        } catch (closeError) {}
    }

    function readTextFile(file) {
        file.encoding = "UTF8";
        if (!file.open("r")) {
            throw new Error("Could not read temporary SVG file.");
        }

        var content = file.read();
        file.close();
        return content;
    }

    function writeTextFile(file, content) {
        file.encoding = "UTF8";
        file.lineFeed = "Unix";

        if (!file.open("w")) {
            throw new Error("Could not write destination SVG file.");
        }

        file.write(content);
        file.close();
    }

    function ensureSvgExtension(file) {
        if (/\.svg$/i.test(file.name)) {
            return file;
        }

        return new File(file.fsName + ".svg");
    }

    function resolveNonOverwritingFile(file) {
        var folderPath = file.parent.fsName;
        var name = file.name;
        var extMatch = name.match(/(\.[^.]+)$/);
        var extension = extMatch ? extMatch[1] : "";
        var baseName = extension ? name.substring(0, name.length - extension.length) : name;
        var candidate = file;
        var counter = 2;

        while (candidate.exists) {
            candidate = new File(folderPath + "/" + baseName + "-" + counter + extension);
            counter += 1;
        }

        return candidate;
    }

    function sanitizeFileBaseName(value) {
        return String(value)
            .replace(/[\\\/:*?"<>|]+/g, "-")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    function escapeForRegExp(value) {
        return value.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    }

    function formatNumber(value, precision) {
        var power = Math.pow(10, precision);
        var rounded = Math.round(value * power) / power;
        var text = String(rounded);

        if (text.indexOf(".") !== -1) {
            text = text.replace(/0+$/, "").replace(/\.$/, "");
        }

        return text;
    }

    function trim(value) {
        return value.replace(/^\s+|\s+$/g, "");
    }

    function toIntOrDefault(value, fallback) {
        var parsed = parseInt(value, 10);
        return isNaN(parsed) ? fallback : parsed;
    }

    function applySvgFontType(exportOptions, outlineText) {
        try {
            if (outlineText && SVGFontType && SVGFontType.OUTLINEFONT !== undefined) {
                exportOptions.fontType = SVGFontType.OUTLINEFONT;
                return;
            }

            if (!outlineText && SVGFontType && SVGFontType.CEFFONT !== undefined) {
                exportOptions.fontType = SVGFontType.CEFFONT;
            }
        } catch (fontTypeError) {
            // Some Illustrator/CEP combinations reject explicit fontType enums.
            // Falling back to Illustrator's default export behavior is safer than aborting the export.
        }
    }

    function padNumber(value, width) {
        var text = String(value);
        while (text.length < width) {
            text = "0" + text;
        }
        return text;
    }

    function stringify(payload) {
        if (typeof JSON !== "undefined" && JSON.stringify) {
            return JSON.stringify(payload);
        }

        return stringifyValue(payload);
    }

    function stringifyValue(value) {
        var key = "";
        var parts = [];

        if (value === null) {
            return "null";
        }

        if (value === true) {
            return "true";
        }

        if (value === false) {
            return "false";
        }

        if (typeof value === "number") {
            return isFinite(value) ? String(value) : "null";
        }

        if (typeof value === "string") {
            return '"' + escapeJsonString(value) + '"';
        }

        if (value instanceof Array) {
            for (var i = 0; i < value.length; i += 1) {
                parts.push(stringifyValue(value[i]));
            }
            return "[" + parts.join(",") + "]";
        }

        if (typeof value === "object") {
            for (key in value) {
                if (value.hasOwnProperty(key)) {
                    parts.push('"' + escapeJsonString(key) + '":' + stringifyValue(value[key]));
                }
            }
            return "{" + parts.join(",") + "}";
        }

        return "null";
    }

    function escapeJsonString(value) {
        return String(value)
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n")
            .replace(/\t/g, "\\t");
    }

    function stringifyError(error) {
        return stringify({
            ok: false,
            error: error && error.message ? error.message : "Unknown Illustrator error.",
            line: error && error.line ? error.line : ""
        });
    }
}(SVGBeaverPanel));
