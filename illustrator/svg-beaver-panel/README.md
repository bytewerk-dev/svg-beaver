# SVG Beaver Panel

CEP panel extension for Adobe Illustrator.

## Features

- button-based export from the current selection, with fallback to the active artboard
- switchable export mode for one SVG or one SVG per selected top-level object
- minimal SVG cleanup after Illustrator export
- `currentColor` fill and optional stroke conversion
- optional text outlining
- optional `xmlns` retention for standalone SVG files

## Install for local development

1. Run the installer script:

```bash
./scripts/install-panel-macos.sh
```

2. Enable CEP debug mode if you want unsigned local development and DevTools:

```bash
./scripts/enable-cep-debug-macos.sh
```

3. The installer copies the panel to:

```text
~/Library/Application Support/Adobe/CEP/extensions/com.bytewerk.svgbeaver
```

4. Restart Illustrator.
5. Open the panel via `Window > Extensions > SVG Beaver`.

If the panel appears blank, run this once and restart Illustrator again:

```bash
./scripts/reset-cep-cache-macos.sh
```

## Uninstall

```bash
./scripts/uninstall-panel-macos.sh
```

## Package for release

Create an unsigned zip package:

```bash
./scripts/package-panel.sh
```

This writes:

```text
dist/com.bytewerk.svgbeaver.zip
```

If you provide signing variables, the same script also creates a signed ZXP:

```bash
ZXPSIGNCMD=/path/to/ZXPSignCmd \
P12_CERT=/path/to/certificate.p12 \
P12_PASSWORD='your-password' \
./scripts/package-panel.sh
```

Output:

```text
dist/com.bytewerk.svgbeaver.zxp
```

## Debugging

- The panel includes a `.debug` file with the Illustrator host ID `ILST` on port `8088`.
- After enabling CEP debug mode, open [http://localhost:8088](http://localhost:8088) in a browser to inspect the panel.
- On current Illustrator builds this usually means enabling `com.adobe.CSXS.12`, not only older `CSXS.11` keys.

## Export behavior

- `One SVG from current selection or active artboard` behaves like the original export flow.
- `One SVG per selected top-level object` exports each selected object or group as its own file.
- In separate mode, groups stay together and are not split into their internal paths.
