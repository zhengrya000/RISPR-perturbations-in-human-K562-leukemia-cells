import type { ViewMode } from "./types";

// Atmospheric colors stay separate from the gold/purple evaluated-pair graph.
export const starPalettes = {
  explorer: ["#8ebcff", "#79d8c3", "#ef95ad"],
  scientist: ["#76cfc9", "#739ee8", "#ed9e79"],
} satisfies Record<ViewMode, [string, string, string]>;

export const palettes = {
  explorer: {
    background: "#07090d", observed: "#ece7dc", additive: "#b69a71", gears: "#dbc58d", control: "#667183",
    focus: "#e0cf9e", partner: "#ece7d9", node: "#a8b2c1", label: "#f0e7cd", partnerLabel: "#c3bfae",
    selectedEdge: "214,198,154", goodEdge: "191,173,128", otherEdge: "145,127,99", partnerGoodEdge: "210,190,142", partnerOtherEdge: "184,162,125",
  },
  scientist: {
    background: "#0a0810", observed: "#eee7f6", additive: "#9081ad", gears: "#bd9bea", control: "#6d637f",
    focus: "#c6a8f1", partner: "#e3d8f4", node: "#a8a0ba", label: "#eee2ff", partnerLabel: "#cfc1e5",
    selectedEdge: "196,166,237", goodEdge: "170,139,211", otherEdge: "116,99,145", partnerGoodEdge: "189,160,227", partnerOtherEdge: "153,132,184",
  },
} satisfies Record<ViewMode, Record<string, string>>;
