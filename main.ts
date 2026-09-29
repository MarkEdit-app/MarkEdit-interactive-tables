import { selectAll } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import { markdownTables, TableStyle } from 'codemirror-markdown-tables';
import { MarkEdit } from 'markedit-api';

import { installTableClickWorkaround } from './src/compatibility.ts';
import { readSettings } from './src/settings.ts';
import { createTableCreationMenu } from './src/creation.ts';
import { createTableControls } from './src/menu.ts';
import { localizedStrings } from './src/strings.ts';
import { adaptiveTableTheme, syncTableColors, tableTheme } from './src/theme.ts';

const {
  selectionType,
  handlePosition,
  lineWrapping,
  tableCreationMenu,
  style,
} = readSettings(MarkEdit.userSettings);

const controls = createTableControls(
  markdownTables({
    extensions: [keymap.of([{ key: 'Mod-a', run: selectAll }])],
    selectionType,
    handlePosition,
    lineWrapping,
    style: TableStyle.default.with({
      '--tbl-style-font-family': style.fontFamily,
      '--tbl-style-font-size': style.fontSize,
      '--tbl-style-default-header-alignment': style.defaultHeaderAlignment,
    }),
    theme: adaptiveTableTheme,
    strings: localizedStrings,
  }),
  tableCreationMenu,
  localizedStrings,
);

MarkEdit.addExtension([
  controls.extension,
  tableTheme,
  syncTableColors,
  createTableCreationMenu(tableCreationMenu, localizedStrings),
]);

MarkEdit.addMainMenuItem(controls.menu);
MarkEdit.onEditorReady(installTableClickWorkaround);
