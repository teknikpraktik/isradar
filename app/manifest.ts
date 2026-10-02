import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Isvak",
    short_name: "Isvak",
    description: "Datadriven bevakning av isbildning",
    lang: "sv",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0c1015",
    theme_color: "#0c1015",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
