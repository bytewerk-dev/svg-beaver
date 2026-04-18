# Releasing SVG Beaver

## Prepare

1. Verify the Illustrator script still exports correctly.
2. Verify the CEP panel still loads and exports from the button path.
3. Update version numbers in:
   - `illustrator/svg-beaver-panel/CSXS/manifest.xml`
4. Refresh screenshots in `docs/screenshots/`.
5. Update README text if install steps changed.

## Build

From `illustrator/svg-beaver-panel/`:

```bash
./scripts/package-panel.sh
```

This creates:

```text
dist/com.bytewerk.svgbeaver.zip
```

To create a signed ZXP as well:

```bash
ZXPSIGNCMD=/path/to/ZXPSignCmd \
P12_CERT=/path/to/certificate.p12 \
P12_PASSWORD='your-password' \
./scripts/package-panel.sh
```

## Publish on GitHub

1. Push the repository.
2. Create a GitHub Release.
3. Attach:
   - `dist/com.bytewerk.svgbeaver.zip`
   - `dist/com.bytewerk.svgbeaver.zxp` if available
4. Include short release notes:
   - supported Illustrator version tested
   - major export behavior changes
   - known drag-and-drop limitations
