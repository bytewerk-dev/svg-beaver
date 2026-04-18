#target illustrator

(function () {
    if (app.documents.length === 0) {
        alert("No open Illustrator document found.");
        return;
    }

    var doc = app.activeDocument;
    var hasSelection = hasExportableSelection(doc);
    var settings = showDialog(doc);

    if (!settings) {
        return;
    }

    var destination = getSuggestedExportFile(doc).saveDlg("Export web-optimized SVG");
    if (!destination) {
        return;
    }

    destination = ensureSvgExtension(destination);

    var tempFolder = new Folder(Folder.temp.fsName + "/svg-beaver-" + new Date().getTime());
    if (!tempFolder.exists) {
        tempFolder.create();
    }

    var tempBaseFile = new File(tempFolder.fsName + "/export");
    var exportedFile = null;
    var tempDoc = null;
    var exportContext = null;

    try {
        exportContext = buildExportContext(doc);
        tempDoc = exportContext.documentRef;

        exportSvg(tempDoc, tempBaseFile, settings, exportContext.usesTemporaryDocument);
        exportedFile = findExportedSvgFile(tempFolder);

        if (!exportedFile || !exportedFile.exists) {
            throw new Error("Illustrator did not create an SVG export.");
        }

        var rawSvg = readTextFile(exportedFile);
        var sanitizedSvg = sanitizeSvg(rawSvg, exportContext.bounds, settings);

        writeTextFile(destination, sanitizedSvg);

        alert("SVG exported successfully:\n" + destination.fsName);
    } catch (error) {
        var errorLine = error && error.line ? "\nLine: " + error.line : "";
        alert("SVG export failed:\n" + error.message + errorLine);
    } finally {
        closeTemporaryDocument(tempDoc, doc);
        cleanupTempFolder(tempFolder);
    }

    function showDialog(documentRef) {
        var dialog = new Window("dialog", "SVG Beaver Export");
        dialog.orientation = "column";
        dialog.alignChildren = ["fill", "top"];

        var info = dialog.add("statictext", undefined, "Exports the selection or active artboard as a minimal web SVG.");
        info.characters = 48;

        var artboardIndex = documentRef.artboards.getActiveArtboardIndex();
        var artboardName = documentRef.artboards[artboardIndex].name;
        var targetLabel = hasSelection ? "Selection (preferred) or artboard" : "Active artboard";
        dialog.add("statictext", undefined, "Target: " + targetLabel);
        dialog.add("statictext", undefined, "Artboard fallback: " + artboardName);

        var precisionGroup = dialog.add("group");
        precisionGroup.add("statictext", undefined, "Coordinate precision:");
        var precisionDropdown = precisionGroup.add("dropdownlist", undefined, ["1", "2", "3", "4", "5", "6", "7"]);
        precisionDropdown.selection = 2;

        var optionsPanel = dialog.add("panel", undefined, "Cleanup");
        optionsPanel.orientation = "column";
        optionsPanel.alignChildren = ["left", "top"];
        optionsPanel.margins = 12;

        var fillCheckbox = optionsPanel.add("checkbox", undefined, "Convert fill to currentColor");
        fillCheckbox.value = true;

        var strokeCheckbox = optionsPanel.add("checkbox", undefined, "Convert existing strokes to currentColor");
        strokeCheckbox.value = true;

        var outlineTextCheckbox = optionsPanel.add("checkbox", undefined, "Outline text during export");
        outlineTextCheckbox.value = true;

        var buttons = dialog.add("group");
        buttons.alignment = "right";
        var cancelButton = buttons.add("button", undefined, "Cancel", { name: "cancel" });
        var exportButton = buttons.add("button", undefined, "Export", { name: "ok" });

        cancelButton.onClick = function () {
            dialog.close(0);
        };

        exportButton.onClick = function () {
            dialog.close(1);
        };

        var result = dialog.show();
        if (result !== 1) {
            return null;
        }

        return {
            coordinatePrecision: parseInt(precisionDropdown.selection.text, 10),
            useCurrentColorFill: fillCheckbox.value,
            useCurrentColorStroke: strokeCheckbox.value,
            outlineText: outlineTextCheckbox.value
        };
    }

    function buildExportContext(documentRef) {
        if (hasExportableSelection(documentRef)) {
            return buildSelectionExportContext(documentRef);
        }

        return {
            documentRef: documentRef,
            bounds: getActiveArtboardBounds(documentRef),
            usesTemporaryDocument: false
        };
    }

    function buildSelectionExportContext(documentRef) {
        var selectionItems = getExportableSelection(documentRef);
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
        var targetLayer = temporaryDocument.layers[0];
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

    function exportSvg(documentRef, baseFile, settingsRef, useWholeDocument) {
        var artboardIndex = documentRef.artboards.getActiveArtboardIndex();
        var options = new ExportOptionsSVG();

        options.compressed = false;
        options.coordinatePrecision = settingsRef.coordinatePrecision;
        options.cssProperties = SVGCSSPropertyLocation.PRESENTATIONATTRIBUTES;
        options.documentEncoding = SVGDocumentEncoding.UTF8;
        options.DTD = SVGDTDVersion.SVG1_1;
        options.embedRasterImages = false;
        options.fontSubsetting = SVGFontSubsetting.GLYPHSUSED;
        applySvgFontType(options, settingsRef.outlineText);
        options.includeFileInfo = false;
        options.includeUnusedStyles = false;
        options.includeVariablesAndDatasets = false;
        options.optimizeForSVGViewer = false;
        options.preserveEditability = false;
        options.slices = false;
        options.sVGAutoKerning = false;
        options.sVGTextOnPath = false;

        if (useWholeDocument) {
            options.saveMultipleArtboards = false;
            options.artboardRange = "";
        } else {
            options.saveMultipleArtboards = true;
            options.artboardRange = String(artboardIndex + 1);
        }

        documentRef.exportFile(baseFile, ExportType.SVG, options);
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

    function sanitizeSvg(svgText, bounds, settingsRef) {
        var width = formatNumber(bounds.width, settingsRef.coordinatePrecision);
        var height = formatNumber(bounds.height, settingsRef.coordinatePrecision);
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
        svgText = sanitizeElementTags(svgText, settingsRef);
        svgText = removeEmptyDefs(svgText);
        svgText = removeEmptyGroups(svgText);
        svgText = removeAttributeLessGroups(svgText);
        svgText = removeEmptyGroups(svgText);
        svgText = replaceSvgRoot(svgText, width, height, usesXlink);
        svgText = trimExtraneousWhitespace(svgText);

        return svgText + "\n";
    }

    function sanitizeElementTags(svgText, settingsRef) {
        return svgText.replace(/<([A-Za-z][A-Za-z0-9:_-]*)(\s[^<>]*?)?(\/?)>/g, function (match, tagName, rawAttrs, selfClosing) {
            var lowerTagName = tagName.toLowerCase();
            var attrs = rawAttrs || "";

            if (lowerTagName === "svg") {
                return match;
            }

            attrs = expandStyleAttribute(attrs);
            attrs = removeUnwantedAttributes(attrs, lowerTagName);

            if (isDrawableTag(lowerTagName)) {
                attrs = normalizeFillAttribute(attrs, lowerTagName, settingsRef.useCurrentColorFill);
                attrs = normalizeStrokeAttribute(attrs, settingsRef.useCurrentColorStroke);
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

    function replaceSvgRoot(svgText, width, height, usesXlink) {
        var rootMatch = svgText.match(/<svg\b[^>]*>/i);
        if (!rootMatch) {
            throw new Error("No <svg> root element found.");
        }

        var rootTag = '<svg xmlns="http://www.w3.org/2000/svg"';
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

    function ensureSvgExtension(file) {
        var name = file.name;
        if (/\.svg$/i.test(name)) {
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

    function padNumber(value, width) {
        var text = String(value);
        while (text.length < width) {
            text = "0" + text;
        }
        return text;
    }

    function closeTemporaryDocument(tempDocument, originalDocument) {
        if (!tempDocument || tempDocument === originalDocument) {
            return;
        }

        try {
            tempDocument.close(SaveOptions.DONOTSAVECHANGES);
        } catch (closeError) {}

        try {
            originalDocument.activate();
        } catch (activateError) {}
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

    function applySvgFontType(exportOptions, outlineText) {
        try {
            if (outlineText && SVGFontType && SVGFontType.OUTLINEFONT !== undefined) {
                exportOptions.fontType = SVGFontType.OUTLINEFONT;
                return;
            }

            if (!outlineText && SVGFontType && SVGFontType.CEFFONT !== undefined) {
                exportOptions.fontType = SVGFontType.CEFFONT;
            }
        } catch (fontTypeError) {}
    }

    function trim(value) {
        return value.replace(/^\s+|\s+$/g, "");
    }
}());
