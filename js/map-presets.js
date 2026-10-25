export const MAP_PRESETS = {
  aurora: {
    id: "aurora",
    label: "Aurora",
    background: 0x617a83,
    exposure: 1.08,
    hemisphere: { sky: 0xdce2d1, ground: 0x444b3f, intensity: 1.05 },
    key: { color: 0xffedc4, intensity: 1.55, direction: [-0.48, 0.82, -0.32] },
    fill: { color: 0xb7c8c4, intensity: 0.62, direction: [0.62, 0.42, 0.55] },
    hillshade: {
      ambient: 0.48,
      lights: [
        { direction: [-0.48, 0.82, -0.32], intensity: 0.78 },
        { direction: [0.62, 0.42, 0.55], intensity: 0.28 },
      ],
    },
    stops: [
      { height: -500, color: 0x758c96 },
      { height: 0, color: 0x879879 },
      { height: 250, color: 0x718467 },
      { height: 700, color: 0x909a75 },
      { height: 1200, color: 0xa3a18a },
      { height: 1800, color: 0xb9b7a8 },
      { height: 2400, color: 0xd8d6ca },
      { height: 3000, color: 0xf0eee5 },
    ],
  },
  classic: {
    id: "classic",
    label: "Atlas",
    background: 0x536c74,
    exposure: 1.12,
    hemisphere: { sky: 0xd6dccd, ground: 0x252d2a, intensity: 1.05 },
    key: { color: 0xe5d7b0, intensity: 1.45, direction: [-0.45, 0.9, -0.35] },
    fill: { color: 0xa9b8a4, intensity: 0.48, direction: [0.7, 0.35, 0.5] },
    hillshade: {
      ambient: 0.5,
      lights: [
        { direction: [0.5, 0.4, -0.866], intensity: 1.2 },
        { direction: [0.866, 0.4, -0.5], intensity: 1.2 },
      ],
    },
    stops: [
      { height: -500, color: 0x668697 },
      { height: 0, color: 0x66966d },
      { height: 250, color: 0x9eaf6b },
      { height: 700, color: 0xc5b981 },
      { height: 1200, color: 0xa78b6a },
      { height: 1800, color: 0x887766 },
      { height: 2400, color: 0xb8ae99 },
      { height: 3000, color: 0xf2efe2 },
    ],
  },
  archipelago: {
    id: "archipelago",
    label: "Archipelago",
    background: 0x12343b,
    exposure: 1.08,
    hemisphere: { sky: 0xc9e0c8, ground: 0x172d28, intensity: 1.05 },
    key: { color: 0xffe9b0, intensity: 1.55, direction: [-0.48, 0.82, -0.32] },
    fill: { color: 0x91c7a0, intensity: 0.62, direction: [0.62, 0.42, 0.55] },
    hillshade: {
      ambient: 0.48,
      lights: [
        { direction: [-0.48, 0.82, -0.32], intensity: 0.78 },
        { direction: [0.62, 0.42, 0.55], intensity: 0.28 },
      ],
    },
    stops: [
      { height: -500, color: 0x0c2532 },
      { height: 0, color: 0x12373b },
      { height: 100, color: 0x174b3b },
      { height: 300, color: 0x28652f },
      { height: 700, color: 0x4b8b22 },
      { height: 1200, color: 0x80b52a },
      { height: 1800, color: 0xb6d64a },
      { height: 2400, color: 0xdde88c },
      { height: 3000, color: 0xf3edc2 },
    ],
  },
  midnight: {
    id: "midnight",
    label: "Midnight",
    background: 0x111a2b,
    exposure: 0.92,
    hemisphere: { sky: 0x9baed0, ground: 0x101629, intensity: 0.9 },
    key: { color: 0xb9c9f5, intensity: 1.35, direction: [-0.48, 0.82, -0.32] },
    fill: { color: 0x758fca, intensity: 0.5, direction: [0.62, 0.42, 0.55] },
    hillshade: {
      ambient: 0.48,
      lights: [
        { direction: [-0.48, 0.82, -0.32], intensity: 0.78 },
        { direction: [0.62, 0.42, 0.55], intensity: 0.28 },
      ],
    },
    stops: [
      { height: -500, color: 0x10182d },
      { height: 0, color: 0x142746 },
      { height: 250, color: 0x1b3c60 },
      { height: 700, color: 0x285d83 },
      { height: 1200, color: 0x426e9a },
      { height: 1800, color: 0x6b70a6 },
      { height: 2400, color: 0xa08bb7 },
      { height: 3000, color: 0xd8cde2 },
    ],
  },
  tactical: {
    id: "tactical",
    label: "Frontier",
    background: 0x485b5d,
    exposure: 0.96,
    hemisphere: { sky: 0xc9d0bd, ground: 0x30382c, intensity: 0.92 },
    key: { color: 0xd7d0b3, intensity: 1.15, direction: [-0.58, 0.74, -0.35] },
    fill: { color: 0x9daf9f, intensity: 0.35, direction: [0.6, 0.3, 0.65] },
    hillshade: {
      ambient: 0.42,
      lights: [
        { direction: [-0.58, 0.74, -0.35], intensity: 0.82 },
        { direction: [0.6, 0.3, 0.65], intensity: 0.18 },
      ],
    },
    stops: [
      { height: -500, color: 0x5e777b },
      { height: 0, color: 0x65775e },
      { height: 250, color: 0x536a4b },
      { height: 700, color: 0x78805b },
      { height: 1200, color: 0x8c8467 },
      { height: 1800, color: 0xa49e8d },
      { height: 2400, color: 0xc4c2b6 },
      { height: 3000, color: 0xe1dfd5 },
    ],
  },
  highContrast: {
    id: "highContrast",
    label: "Relief",
    background: 0x4f6874,
    exposure: 1.16,
    hemisphere: { sky: 0xd6e0df, ground: 0x333b3b, intensity: 1.15 },
    key: { color: 0xfff0d6, intensity: 1.72, direction: [-0.55, 0.78, -0.3] },
    fill: { color: 0xa8c2ce, intensity: 0.54, direction: [0.65, 0.38, 0.55] },
    hillshade: {
      ambient: 0.38,
      lights: [
        { direction: [-0.55, 0.78, -0.3], intensity: 1.08 },
        { direction: [0.65, 0.38, 0.55], intensity: 0.24 },
      ],
    },
    stops: [
      { height: -500, color: 0x5b7885 },
      { height: 0, color: 0x819875 },
      { height: 250, color: 0x627c53 },
      { height: 700, color: 0x99a66d },
      { height: 1200, color: 0xb1a47e },
      { height: 1800, color: 0xc4c2b4 },
      { height: 2400, color: 0xe1dfd3 },
      { height: 3000, color: 0xfffdf4 },
    ],
  },
};

export function getElevationGradient(stops) {
  const min = stops[0].height;
  const max = stops[stops.length - 1].height;
  return `linear-gradient(to right, ${stops.map(({ height, color }) => {
    const position = (height - min) / (max - min) * 100;
    return `#${color.toString(16).padStart(6, "0")} ${position}%`;
  }).join(", ")})`;
}
