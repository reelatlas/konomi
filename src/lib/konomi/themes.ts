import type { ThemeColors, ThemeKey } from "./types";

// Role-based palettes, not hue-based — every key is a semantic role so the
// names hold up across all three themes. Mirrored as CSS custom properties
// in src/app/globals.css under `[data-theme="<key>"]`; keep both in sync.
export const THEMES: Record<ThemeKey, ThemeColors> = {
  default: {
    name: "Konomi",
    bg: "#EFE7F8",
    surface: "#FCFAFF",
    ink: "#191225",
    muted: "#A985E2",
    fill: "#E4D7F4",
    primary: "#564FD6",
    primaryDeep: "#24215A",
    secondary: "#E4F46F",
    onPrimary: "#FCFAFF",
    onSecondary: "#191225",
    disabledBg: "#F4EEFB",
    disabledText: "#9A8BB5",
    slotEmpty: "#F4EEFB",
  },
  dark: {
    name: "Tide",
    bg: "#12181C",
    surface: "#1C242A",
    ink: "#DCE4E6",
    muted: "#66727B",
    fill: "#26323B",
    primary: "#3486B4",
    primaryDeep: "#8FBDD6",
    secondary: "#6FD3D6",
    onPrimary: "#EAF3F5",
    onSecondary: "#0E1518",
    disabledBg: "#243038",
    disabledText: "#515E66",
    slotEmpty: "#243038",
  },
  third: {
    name: "Newsprint",
    bg: "#F3EDE1",
    surface: "#FFFDF6",
    ink: "#211C17",
    muted: "#B3A589",
    fill: "#EBE0CB",
    primary: "#D8392E",
    primaryDeep: "#5B1813",
    secondary: "#F2C14E",
    onPrimary: "#FFF7EC",
    onSecondary: "#211C17",
    disabledBg: "#F1E9DA",
    disabledText: "#A99B82",
    slotEmpty: "#F1E9DA",
  },
};

export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];
