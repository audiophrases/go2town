# Owned 360° photos

Put owned equirectangular 2:1 JPG panoramas in this folder when replacing or supplementing the local Street View fixture with imagery you can redistribute.

Example filenames for hand-authored scenes:

```text
start.jpg  wp1.jpg  wp2.jpg  wp3.jpg  wp4.jpg  station.jpg
```

Then set each scene's `image` field to the filename and optionally set `northOffset` so yaw/heading math lines up with the compass.

Current default gameplay uses generated Google Street View fixture cubemaps from `../../../street-view-imagery/`, not this folder. Scenes with neither fixture cubemap nor `image` automatically get placeholder panoramas, so the game still runs while imagery is incomplete.

For capture instructions, route planning, and how to use the hidden `q23r-` admin bookmark mode to mark future mission/subgame spots, see:

- [`../../../docs/CAPTURE_GUIDE.md`](../../../docs/CAPTURE_GUIDE.md)
- [`../../../docs/ADMIN_BOOKMARKS.md`](../../../docs/ADMIN_BOOKMARKS.md)
- [`../../../docs/DEVELOPMENT.md`](../../../docs/DEVELOPMENT.md)
