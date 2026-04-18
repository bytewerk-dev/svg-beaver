# SVG Beaver

Minimal SVG export tools for Adobe Illustrator.

SVG Beaver exports the current selection, or falls back to the active artboard, and rewrites Illustrator's default SVG output into a much cleaner web-oriented form.

## Why it exists

Illustrator's built-in SVG export is fine for general interchange, but not for a tight web workflow where you want:

- no XML header
- no `DOCTYPE`
- no Illustrator class clutter
- a minimal root `<svg>` with a `viewBox`
- `currentColor`-based icons and UI graphics

## What it does

- exports the current selection when available, otherwise the active artboard
- removes XML header, `DOCTYPE`, comments, metadata, titles, and style blocks
- removes `id`, `class`, `data-name`, and a few Illustrator-specific attributes
- rewrites the root element to a minimal `<svg>` with `viewBox`, optionally with `xmlns`
- converts fills to `currentColor`
- optionally converts existing strokes to `currentColor`
- optionally outlines text during export
- panel mode can export either one combined SVG or one SVG per selected top-level object

## Included variants

- [illustrator/SVG Beaver Export.jsx](illustrator/SVG%20Beaver%20Export.jsx)
  Direct Illustrator script with a native dialog.
- [illustrator/svg-beaver-panel](illustrator/svg-beaver-panel)
  Dockable CEP panel with a clean export flow and a mode switch for combined or separate exports.

## Quick Start

### Option 1: Illustrator script

1. Copy [illustrator/SVG Beaver Export.jsx](illustrator/SVG%20Beaver%20Export.jsx) into your Illustrator Scripts folder.
2. Typical macOS path:

```text
/Applications/Adobe Illustrator [version]/Presets.localized/en_US/Scripts/
```

3. Restart Illustrator.
4. Run `File > Scripts > SVG Beaver Export`.

You can also run it once via `File > Scripts > Other Script...`.

### Option 2: Dockable panel

See [illustrator/svg-beaver-panel/README.md](illustrator/svg-beaver-panel/README.md) for install, debugging, packaging, and release steps.

## Recommended Workflow

1. Select the object or group you want to export.
2. If nothing is selected, the tool falls back to the active artboard.
3. Keep the artwork simple: paths, compound paths, simple groups, optional text.
4. Export via the script or panel.
5. Choose whether fill and stroke should become `currentColor`.
6. Save the final SVG.

## Example Output

```svg
<svg viewBox="0 0 24 24">
  <path fill="currentColor" d="..."/>
</svg>
```

## Repository Layout

```text
illustrator/
  SVG Beaver Export.jsx
  svg-beaver-panel/
docs/
  RELEASING.md
  screenshots/
```

## Notes

- The export is optimized for simple monochrome web graphics and icons.
- Selection export uses the visible bounds of the selected artwork as the SVG viewport.
- The panel defaults to a root `<svg>` with only `viewBox`; it can optionally keep `xmlns` for standalone files.
- If your artwork depends on advanced SVG features like masks, complex defs, clipping edge-cases, or embedded rasters, check the output manually.

## Releasing

- Packaging and signing instructions: [docs/RELEASING.md](docs/RELEASING.md)
- Panel-specific build and debug instructions: [illustrator/svg-beaver-panel/README.md](illustrator/svg-beaver-panel/README.md)
- Screenshot placeholders: [docs/screenshots/README.md](docs/screenshots/README.md)

## License

[MIT](LICENSE)
