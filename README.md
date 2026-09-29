# MarkEdit-interactive-tables

Interactive Markdown tables for MarkEdit, with editable cells, native row and column menus, and theme-aware styling.

## Installation

Install this extension from the [MarkEdit Extension Registry](https://markedit-app.github.io/extensions/#markedit-interactive-tables).

## Usage

See the [table editor documentation](https://github.com/MarkEdit-app/codemirror-markdown-tables#table-editor) for usage.

Additional commands are available under **Extensions > Interactive Tables**.

## Settings

Add `extension.markeditInteractiveTables` to [settings.json](https://github.com/MarkEdit-app/MarkEdit/wiki/Customization#advanced-settings). Defaults:

```json
{
  "extension.markeditInteractiveTables": {
    "tableCreationMenu": ["2x2", "3x3", "4x4"],
    "selectionType": "codemirror",
    "handlePosition": "outside",
    "lineWrapping": "wrap",
    "style": {
      "fontFamily": "system-ui",
      "fontSize": "inherit",
      "defaultHeaderAlignment": "left"
    }
  }
}
```

`tableCreationMenu` controls the table suggestions shown when you type `|` at the start of a line. Sizes use `"rowsxcolumns"` (positive integers, including the header row). Use `[]` to disable `|` suggestions; the menu then uses the default sizes.

These options apply only to tables and their cells:

| Setting | Values |
| --- | --- |
| `selectionType` | `"codemirror"` (drawn selections), `"native"` (browser selections) |
| `handlePosition` | `"outside"`, `"inside"` |
| `lineWrapping` | `"wrap"`, `"nowrap"` |

Omitted values use defaults, only the listed settings are supported.

### Styling

The `style` object supports:

| Setting | Values |
| --- | --- |
| `fontFamily` | CSS font family, e.g. `"Menlo, monospace"` |
| `fontSize` | CSS font size, e.g. `"14px"`, `"1.2em"`, or `"inherit"` |
| `defaultHeaderAlignment` | `"left"`, `"center"`, `"right"` for columns without explicit alignment |

For more control, use a [custom stylesheet](https://github.com/MarkEdit-app/MarkEdit/wiki/Customization#editor-appearance-and-behavior):

```css
:root {
  --tbl-style-font-family: "Menlo", monospace;
  --tbl-style-font-size: 14px;
  --tbl-style-default-header-alignment: center;
  --tbl-theme-border-color: #888;
}
```

CSS variables override matching settings. Restart MarkEdit after changing settings or the stylesheet.

## Building

```
yarn install
yarn lint
yarn test
yarn build
```

`yarn build` also deploys the extension to your local MarkEdit installation.

`yarn lint:fix` to apply automatic style fixes.
