export interface Series {
  title: string;
  year: number;
  eps: number;
  tags: string[];
}

export interface ResultEntry {
  series: Series;
  score: number;
}

export type ThemeKey = "default" | "dark" | "third";

export interface ThemeColors {
  name: string;
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  fill: string;
  primary: string;
  secondary: string;
  onPrimary: string;
  onSecondary: string;
  disabledBg: string;
  disabledText: string;
  slotEmpty: string;
}

export type MatchKey = "1" | "2" | "3";

export type Slot = string | null;
