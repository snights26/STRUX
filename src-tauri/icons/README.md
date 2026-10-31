# STRUX application icons

`icon.svg` is an original, code-authored placeholder mark for the STRUX Academic Research Edition. It uses a truss grid and structural-node motif; it contains no third-party artwork.

Generate the Tauri icon set after changing the SVG:

```powershell
npx tauri icon src-tauri/icons/icon.svg
```

The desktop bundle configuration explicitly uses `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, and `icon.ico`. Windows requires `icon.ico`; the checked-in file contains multiple raster sizes and is structurally validated in the development record.
