import { ThemeMode, type AppearanceDoc, type ThemeDoc } from './filesystem/types';

export type ThemeStyle = Record<`--${string}`, string>;

export function resolveTheme(
  appearance: AppearanceDoc,
  light: ThemeDoc,
  dark: ThemeDoc,
  prefersDark: boolean,
): ThemeDoc {
  if (appearance.mode === ThemeMode.Dark) return dark;
  if (appearance.mode === ThemeMode.Light) return light;
  return prefersDark ? dark : light;
}

export function themeStyle(theme: ThemeDoc): ThemeStyle {
  return {
    '--app-border': theme.metrics.appBorder,
    '--detail-pad': theme.metrics.detailPad,
    '--font-code': theme.typography.codeFont,
    '--font-code-size': theme.typography.codeSize,
    '--line-code': theme.typography.codeLineHeight,
    '--preview-image-width': theme.metrics.previewImageWidth,
    '--tab-control-margin': theme.metrics.tabControlMargin,
    '--tab-pad': theme.metrics.tabPad,
    '--color-bg': theme.palette.background,
    '--color-surface': theme.palette.surface,
    '--color-sidebar': theme.palette.sidebar,
    '--color-tabs': theme.palette.tabs,
    '--color-border': theme.palette.border,
    '--color-hover': theme.palette.hover,
    '--color-selected-bg': theme.palette.selectedBackground,
    '--color-selected-text': theme.palette.selectedText,
    '--color-text': theme.palette.text,
    '--color-code': theme.palette.code,
    '--color-muted': theme.palette.muted,
    '--tree-indent-guide': theme.palette.treeGuide,
  };
}
